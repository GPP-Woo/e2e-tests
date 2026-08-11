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
#   3. The GlobalConfiguration publication URL templates. They ship empty, which
#      makes the API serve `urlPublicatieIntern`/`urlPublicatieExtern` as "" — so
#      the GPP-app renders "Bekijk online" with href="" and clicking it reloads
#      the GPP-app instead of opening the burgerportaal. These are *browser*
#      URLs (the ports the stack publishes), not in-cluster service names.
#
# Works against both the kind cluster (default, `kubectl exec`) and the old
# docker-compose stack (`STACK=compose`). Idempotent: every Service is keyed on
# its api_root (the UNIQUE column), so re-running updates in place instead of
# colliding with a row the chart fixtures already created under another slug.
#
#   ./setup/provision-documenten-api.sh
#
# Verify: POST /api/v2/documenten no longer 500s "No documents API configured".
# Also wires ODRC→zoeken indexing + zoeken→ODRC download (document body ingest).
set -euo pipefail

STACK="${STACK:-kind}"
NAMESPACE="${NAMESPACE:-gpp-e2e}"
ODRC_CONTAINER="${ODRC_CONTAINER:-gpp-woo-odrc-django-1}"
OZ_CONTAINER="${OZ_CONTAINER:-gpp-woo-openzaak-web-1}"
ZOEKEN_DEPLOY="${ZOEKEN_DEPLOY:-deploy/gpp-zoeken}"
# Must match the openzaak fixture (applicatie + jwtsecret) so woo-publications
# authenticates to OpenZaak's Documenten API.
CLIENT_ID="${OZ_CLIENT_ID:-woo-publications-dev}"
SECRET="${OZ_SECRET:-insecure-yQL9Rzh4eHGVmYx5w3J2gu}"
RSIN="${ORG_RSIN:-123456782}"
ZOEKEN_TOKEN="${ZOEKEN_TOKEN:-insecure-ea1a8d297e3b2d3313b8a30b18959c3}"
ZOEKEN_ROOT="${ZOEKEN_ROOT:-http://gpp-zoeken:8000/api/v1/}"
# Browser-facing publication URLs (`<UUID>` is substituted by woo-publications).
# Keep in sync with GPP_APP_BASE_URL / GPP_BURGERPORTAAL_BASE_URL in .env.
APP_PUBLICATION_URL="${APP_PUBLICATION_URL:-http://localhost:8130/publicaties/<UUID>}"
BURGERPORTAAL_PUBLICATION_URL="${BURGERPORTAAL_PUBLICATION_URL:-http://localhost:8140/publicaties/<UUID>}"

if [ "$STACK" = kind ]; then
  DRC_ROOT="${DRC_ROOT:-http://openzaak:8000/documenten/api/v1/}"
  # In-cluster host for odrc; also the Host the e2e document seed sends. Must be
  # the FQDN: Django's URLValidator rejects a dotless hostname, so OpenZaak would
  # reject the informatieobjecttype URL built from a bare svc name with 'bad-url'.
  ODRC_ROOT="${ODRC_ROOT:-http://gpp-publicatiebank-nginx.${NAMESPACE}.svc.cluster.local/catalogi/api/v1/}"
  ODRC_DOWNLOAD_FQDN="${ODRC_DOWNLOAD_FQDN:-http://gpp-publicatiebank-nginx.${NAMESPACE}.svc.cluster.local/api/v2/}"
  ODRC_DOWNLOAD_BARE="${ODRC_DOWNLOAD_BARE:-http://gpp-publicatiebank-nginx/api/v2/}"
  odrc_shell() { kubectl exec -n "$NAMESPACE" -i "deploy/gpp-publicatiebank" -- python /app/src/manage.py shell -c "$1"; }
  oz_shell() { kubectl exec -n "$NAMESPACE" -i "deploy/openzaak-web" -- python /app/src/manage.py shell -c "$1"; }
  zoeken_shell() { kubectl exec -n "$NAMESPACE" -i "$ZOEKEN_DEPLOY" -- python /app/src/manage.py shell -c "$1"; }
else
  DRC_ROOT="${DRC_ROOT:-http://openzaak.docker.internal:8001/documenten/api/v1/}"
  ODRC_ROOT="${ODRC_ROOT:-http://host.docker.internal:8000/catalogi/api/v1/}"
  ODRC_DOWNLOAD_FQDN="${ODRC_DOWNLOAD_FQDN:-http://host.docker.internal:8000/api/v2/}"
  ODRC_DOWNLOAD_BARE="${ODRC_DOWNLOAD_BARE:-http://host.docker.internal:8000/api/v2/}"
  ZOEKEN_ROOT="${ZOEKEN_ROOT:-http://host.docker.internal:8110/api/v1/}"
  odrc_shell() { docker exec -i "$ODRC_CONTAINER" python /app/src/manage.py shell -c "$1"; }
  oz_shell() { docker exec -i "$OZ_CONTAINER" python /app/src/manage.py shell -c "$1"; }
  zoeken_shell() { docker exec -i "${ZOEKEN_CONTAINER:-gpp-woo-zoeken-web-1}" python /app/src/manage.py shell -c "$1"; }
fi

odrc_shell "
from zgw_consumers.models import Service
from zgw_consumers.constants import APITypes, AuthTypes
from woo_publications.config.models import GlobalConfiguration
# Key on api_root, not slug: api_root is the UNIQUE column, and the chart's own
# fixtures already own some of these roots under a different (often empty) slug.
# Keying on slug then tries to INSERT a second row with the same api_root and
# dies on zgw_consumers_service_api_root_key — so re-running was not idempotent.
svc, created = Service.objects.update_or_create(
    api_root='${DRC_ROOT}',
    defaults=dict(
        slug='documenten-api',
        label='Documenten API [Open Zaak]',
        api_type=APITypes.drc,
        auth_type=AuthTypes.zgw,
        client_id='${CLIENT_ID}',
        secret='${SECRET}',
        user_id='${CLIENT_ID}',
        user_representation='Woo Publications (dev)',
        timeout=30,
    ),
)
zoeken, _ = Service.objects.update_or_create(
    api_root='${ZOEKEN_ROOT}',
    defaults=dict(
        slug='gpp-zoeken',
        label='GPP-zoeken (e2e)',
        api_type=APITypes.orc,
        auth_type=AuthTypes.api_key,
        header_key='Authorization',
        header_value='Token ${ZOEKEN_TOKEN}',
        timeout=30,
    ),
)
cfg = GlobalConfiguration.get_solo()
cfg.documents_api_service = svc
cfg.gpp_search_service = zoeken
cfg.gpp_app_publication_url_template = '${APP_PUBLICATION_URL}'
cfg.gpp_burgerportaal_publication_url_template = '${BURGERPORTAAL_PUBLICATION_URL}'
if not cfg.organisation_rsin:
    cfg.organisation_rsin = '${RSIN}'
cfg.save()
print('documenten-api service', 'created' if created else 'updated', '->', svc.api_root)
print('gpp_search_service ->', zoeken.api_root)
print('global config: documents_api_service=', cfg.documents_api_service_id, 'rsin=', cfg.organisation_rsin)
print('urlPublicatieIntern ->', cfg.gpp_app_publication_url_template)
print('urlPublicatieExtern ->', cfg.gpp_burgerportaal_publication_url_template)
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

zoeken_shell "
from zgw_consumers.models import Service
from zgw_consumers.constants import APITypes, AuthTypes
for i, root in enumerate(['${ODRC_DOWNLOAD_FQDN}', '${ODRC_DOWNLOAD_BARE}']):
    # api_root is the UNIQUE column — key on it (see the odrc block above).
    svc, created = Service.objects.update_or_create(
        api_root=root,
        defaults=dict(
            slug=f'publicatiebank-download-{i}',
            label=f'GPP-publicatiebank downloads ({root})',
            api_type=APITypes.orc,
            auth_type=AuthTypes.api_key,
            header_key='Authorization',
            header_value='Token ${ZOEKEN_TOKEN}',
            timeout=30,
        ),
    )
    print(svc.slug, 'created' if created else 'updated', '->', svc.api_root)
"
