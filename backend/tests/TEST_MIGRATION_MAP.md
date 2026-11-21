# Test Migration Map: test_api.py to pytest

This document maps the original `tests/test_api.py` integration test
to the new pytest modules. The original file is retained until the
migration has been reviewed and validated.

| Original test_api.py section / behaviour | New pytest location |
|---|---|
| Health endpoint | test_auth.py::test_health_check |
| Invalid registration and duplicate registration | test_auth.py::test_registration_rejects_invalid_details; test_auth.py::test_duplicate_registration_returns_conflict |
| Profile update | test_auth.py::test_profile_update |
| Login and logout | test_auth.py::test_login_and_logout |
| Initial cellar inventory, bottle search, storage recommendations, bottle CRUD, placement, stacking, rack management and validation | test_inventory.py::test_cellar_inventory_and_rack_management |
| Vision scans, detection insertion, confirmation, stacking, rejection, movement, removal and labels | test_vision.py::test_vision_scan_and_detection_workflow |
| Device registration, pairing, telemetry, detections, linked cellars and device-token access restrictions | test_devices.py::test_device_pairing_telemetry_and_linked_cellars |
| Environment readings, sensor status, alert configuration, simulated events and notifications | test_environment.py::test_environment_monitoring_and_alerts |
| Wine recommendations, meal pairing, personalisation, AI dialogue, tasting table and persona checks | test_ai.py::test_ai_recommendations_and_dialogue |
| Market briefing, market summary and bottle price history | test_market.py::test_market_briefing_and_price_history |
| Multi-cellar creation, cross-cellar bottle search and user isolation | test_account.py::test_multi_cellar_cross_search_and_user_isolation |
| GDPR export, logout, account deletion and login rejection | test_account.py::test_gdpr_export_logout_and_account_deletion |
| Legal documents, required and optional consents, age validation, password changes, email verification, email changes and password reset | test_account.py::test_account_registration_consents_and_password_security |

## Shared test infrastructure

| Original test_api.py infrastructure | New pytest location |
|---|---|
| Temporary SQLite database and environment configuration | conftest.py |
| Optional PostgreSQL test database configuration and safety check | conftest.py |
| Application/database initialisation and simulator lifecycle | conftest.py |
| HTTP server lifecycle and request helper | conftest.py |
| Adult registration payload | conftest.py |
| Unique registered test user and authentication token | conftest.py |
| Latest email verification code helper | conftest.py |

## Validation status

- [x] All new test modules run individually.
- [x] Complete pytest suite passes: 14 tests.
- [x] Review migration coverage against the original test_api.py.
- [x] Add direct unit tests.
- [ ] Configure and validate CI workflows.
- [ ] Remove the original test_api.py only after migration review.
