#!/usr/bin/env bash
# Provision the Documenten API on the local GPP-Woo stack so publicaties can own
# documents (unblocks TS8 — see PLAN-plateau4-remaining.md "TS8").
#
# OpenZaak already ships the API-authorisation applicatie + jwtsecret + the ORC
# service back to the publicatiebank catalogi (GPP-app/docker/open-zaak/fixtures/
# configuration.json, loaded at deploy). The publicatiebank (woo-publications /
# odrc) side is NOT wired by the deploy (its fixture is "stale" — see the compose
# comment), so this script creates the DRC Service + GlobalConfiguration there.
# Idempotent: re-running updates in place. Requires the stack to be up.
#
#   ./setup/provision-documenten-api.sh
#
# Verify: POST /api/v2/documenten no longer 500s "No documents API configured".
set -euo pipefail

ODRC_CONTAINER="${ODRC_CONTAINER:-gpp-woo-odrc-django-1}"
# Must match GPP-app/docker/open-zaak/fixtures/configuration.json (applicatie +
# jwtsecret) so woo-publications authenticates to OpenZaak's Documenten API.
CLIENT_ID="${OZ_CLIENT_ID:-woo-publications-dev}"
SECRET="${OZ_SECRET:-insecure-yQL9Rzh4eHGVmYx5w3J2gu}"
# openzaak.docker.internal:8001 = OpenZaak's published port, reachable from the
# odrc container via the extra_hosts host-gateway entry in the compose.
DRC_ROOT="${DRC_ROOT:-http://openzaak.docker.internal:8001/documenten/api/v1/}"
RSIN="${ORG_RSIN:-123456782}"

# woo-publications' Application token authenticates as a user-less token
# (request.user is None), which makes sessionprofile's middleware raise
# AttributeError on every API response while an admin session is active — so the
# token API (the only way to seed documents) 500s throughout an e2e run. The
# durable fix lives in GPP-publicatiebank source (api/authorization.py returns
# AnonymousUser instead of None); this live-patches the running image too so a
# stack that has not been rebuilt still works. Idempotent + restarts odrc.
if docker exec -i "$ODRC_CONTAINER" python - <<'PY'
p = "/app/src/woo_publications/api/authorization.py"
s = open(p).read()
if "AnonymousUser" not in s:
    s = s.replace(
        "from .models import Application",
        "from django.contrib.auth.models import AnonymousUser\n\nfrom .models import Application",
    ).replace("return (None, token)", "return (AnonymousUser(), token)")
    open(p, "w").write(s)
    raise SystemExit(10)  # signal "patched, needs restart"
raise SystemExit(0)
PY
then
  echo "token auth already returns AnonymousUser"
elif [ $? -eq 10 ]; then
  echo "patched token auth -> AnonymousUser; restarting $ODRC_CONTAINER"
  docker restart "$ODRC_CONTAINER" >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$ODRC_CONTAINER" python -c "import urllib.request as u; u.urlopen('http://localhost:8000/admin/login/')" >/dev/null 2>&1 && break
    sleep 2
  done
fi

docker exec "$ODRC_CONTAINER" python /app/src/manage.py shell -c "
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
