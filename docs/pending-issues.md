# Pending Issues

## Frontend

### Resolve extensionless local import diagnostics

The VS Code/TypeScript language service intermittently reports false `Cannot find module` diagnostics for newly created sibling client modules when imported without an extension from App Router server pages.

Observed cases:

- `frontend/src/app/[locale]/(protected)/explore/page.tsx` importing `./explore-client`
- `frontend/src/app/[locale]/(protected)/curated/[id]/page.tsx` importing `./curated-details-client`
- `frontend/src/app/[locale]/carplay/page.tsx` importing `./carplay-client`

`next build` and `eslint` resolve the modules correctly. The workaround is to use an explicit `.tsx` extension when diagnostics do not clear, which is allowed by the frontend TypeScript config. Revisit later and return to extensionless imports if the language service/cache behavior stabilizes.
