# Mobile app alignment with the webOS app

## Navigation
The primary mobile tabs now follow the webOS information architecture:
Cellar, Search, Sommelier, Briefing, Value, Settings.

## Implemented alignment
- Cellar is the landing tab and opens the existing interactive cellar map.
- Search reuses the inventory search, filters, sorting, grid/list views, and cross-cellar scope.
- Sommelier retains the mobile tasting-table flow and persona management.
- Briefing aggregates the current cellar condition, bottle count, and available daily cellar note for every cellar.
- Value provides collection counts and style/cellar breakdowns. It intentionally does not invent a monetary valuation because the mobile data model has no market prices or price history.
- Settings retains profile, cellar management, alert thresholds, briefing time, taste preferences, privacy, and appearance controls.

## Known differences from webOS
The supplied mobile project uses a local mock repository and a different data model from the webOS app's HTTP API. As a result, the mobile app does not yet have the webOS market-price feed, external wine/news briefing feed, camera scan upload pipeline, webOS door/3D rendering, climate-zone target editing, or cloud/device sync implementation. Those require backend/data-model integration rather than a navigation or styling change.
