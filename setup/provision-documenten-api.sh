#!/usr/bin/env bash
# Provision the Documenten API on the local GPP-Woo stack so publicaties can own
# documents (unblocks TS8 — see PLAN-plateau4-remaining.md "TS8").
#
# Two things have to be wired, neither of which the deploy does:
#   1. publicatiebank (odrc) -> a DRC Service + GlobalConfiguration pointing at
#      OpenZaak's Documenten API, so POST /api/v2/documenten stops raising
#      "No documents API configured yet!".
#   2. OpenZaak -> an ORC Service for the publicatiebank *catalogi* API, so it can
#      resolve the informatieobjecttype URL odrc sends along. That URL is built
#      from the request Host, so it must be the host OpenZaak can reach odrc on
#      (which is why the seed sends that Host — see bdd/@publicatiebank/support/
#      document.ts). The chart's openzaak fixture still points at the compose
#      host.docker.internal, hence this step.
#
# Works against both the kind cluster (default, `kubectl exec`) and the old
# docker-compose stack (`STACK=compose`). Idempotent: re-running updates in place.
#
#   ./setup/provision-documenten-api.sh
#
# Verify: POST /api/v2/documenten no longer 500s "No documents API configured".
set -euo pipefail

STACK="${STACK:-kind}"
NAMESPACE="${NAMESPACE:-gpp-e2e}"
ODRC_CONTAINER="${ODRC_CONTAINER:-gpp-woo-odrc-django-1}"
OZ_CONTAINER="${OZ_CONTAINER:-gpp-woo-openzaak-web-1}"
# Must match the openzaak fixture (applicatie + jwtsecret) so woo-publications
# authenticates to OpenZaak's Documenten API.
CLIENT_ID="${OZ_CLIENT_ID:-woo-publications-dev}"
SECRET="${OZ_SECRET:-insecure-yQL9Rzh4eHGVmYx5w3J2gu}"
RSIN="${ORG_RSIN:-123456782}"

if [ "$STACK" = kind ]; then
  DRC_ROOT="${DRC_ROOT:-http://openzaak:8000/documenten/api/v1/}"
  # In-cluster host for odrc; also the Host the e2e document seed sends. Must be
  # the FQDN: Django's URLValidator rejects a dotless hostname, so OpenZaak would
  # reject the informatieobjecttype URL built from a bare svc name with 'bad-url'.
  ODRC_ROOT="${ODRC_ROOT:-http://gpp-publicatiebank-nginx.${NAMESPACE}.svc.cluster.local/catalogi/api/v1/}"
  odrc_shell() { kubectl exec -n "$NAMESPACE" -i "deploy/gpp-publicatiebank" -- python /app/src/manage.py shell -c "$1"; }
  oz_shell() { kubectl exec -n "$NAMESPACE" -i "deploy/openzaak-web" -- python /app/src/manage.py shell -c "$1"; }
else
  DRC_ROOT="${DRC_ROOT:-http://openzaak.docker.internal:8001/documenten/api/v1/}"
  ODRC_ROOT="${ODRC_ROOT:-http://host.docker.internal:8000/catalogi/api/v1/}"
  odrc_shell() { docker exec -i "$ODRC_CONTAINER" python /app/src/manage.py shell -c "$1"; }
  oz_shell() { docker exec -i "$OZ_CONTAINER" python /app/src/manage.py shell -c "$1"; }
fi

odrc_shell "
from zgw_consumers.models import Service
from zgw_consumers.constants import APITypes, AuthTypes
from woo_publications.config.models import GlobalConfiguration
svc, created = Service.objects.update_or_create(
    slug='documenten-api',
    defaults=dict(
        label='Documenten API [Open Zaak]',
        api_type=APITypes.drc,
        api_root='${DRC_ROOT}',
        auth_type=AuthTypes.zgw,
        client_id='${CLIENT_ID}',
        secret='${SECRET}',
        user_id='${CLIENT_ID}',
        user_representation='Woo Publications (dev)',
        timeout=30,
    ),
)
cfg = GlobalConfiguration.get_solo()
cfg.documents_api_service = svc
if not cfg.organisation_rsin:
    cfg.organisation_rsin = '${RSIN}'
cfg.save()
print('documenten-api service', 'created' if created else 'updated', '->', svc.api_root)
print('global config: documents_api_service=', cfg.documents_api_service_id, 'rsin=', cfg.organisation_rsin)
"

oz_shell "
from zgw_consumers.models import Service
from zgw_consumers.constants import APITypes, AuthTypes
# OpenZaak ships an older zgw_consumers whose Service has no slug; key on api_root.
svc, created = Service.objects.update_or_create(
    api_root='${ODRC_ROOT}',
    defaults=dict(
        label='Woo Publications (catalogi)',
        oas='${ODRC_ROOT}',
        api_type=APITypes.orc,
        auth_type=AuthTypes.no_auth,
    ),
)
print('catalogi service', 'created' if created else 'updated', '->', svc.api_root)
"
