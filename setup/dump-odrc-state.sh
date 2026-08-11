#!/usr/bin/env bash
# Print why a seeded document may be missing from the DiWoo sitemap.
#
# The burgerportaal only lists a document when it is `gepubliceerd` AND
# `upload_complete` (i.e. the worker registered it with the Documenten API) AND its
# publisher is not `zelf_toegevoegd` (SitemapController skips those). An empty
# sitemap is almost always one of those three, so print all three at once.
#
#   ./setup/dump-odrc-state.sh
#
# Used by the CI failure dump; handy locally for the same question.
#
# CAVEAT when reading this from a CI run: the failure dump runs *after* the suite,
# and globalTeardown has by then deleted every `E2E `-prefixed row. So the document
# counts legitimately read 0 there and say nothing about what the run saw — only
# the wiring lines (services, rsin, url template, organisatie oorsprong) are
# meaningful post-run. For per-document state during a run, the sitemap steps put
# it in their own failure message (see documentReadiness).
set -uo pipefail

NAMESPACE="${NAMESPACE:-gpp-e2e}"

kubectl exec -n "$NAMESPACE" -i deploy/gpp-publicatiebank -- python src/manage.py shell -c '
from collections import Counter

from woo_publications.config.models import GlobalConfiguration
from woo_publications.metadata.models import Organisation
from woo_publications.publications.models import Document

total = Document.objects.count()
print("documents:", total, "by status:", dict(Counter(Document.objects.values_list("publicatiestatus", flat=True))))
print("upload_complete:", Document.objects.filter(upload_complete=True).count(), "of", total)
print("with document_service:", Document.objects.exclude(document_service=None).count(), "of", total)
print("sitemap-eligible (gepubliceerd + upload_complete):", Document.objects.filter(publicatiestatus="gepubliceerd", upload_complete=True).count())
print("actieve organisaties by oorsprong:", dict(Counter(Organisation.objects.filter(is_actief=True).values_list("oorsprong", flat=True))))

cfg = GlobalConfiguration.get_solo()
print("documents_api_service:", cfg.documents_api_service_id)
print("gpp_search_service:", cfg.gpp_search_service_id)
print("organisation_rsin:", cfg.organisation_rsin)
print("burgerportaal url template:", repr(cfg.gpp_burgerportaal_publication_url_template))
'
