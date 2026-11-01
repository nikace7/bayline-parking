# Walk-up customer profiles

Implemented and locally verified on 1 November 2026. An organisation-owned customer profile can exist without a login. A name is required; phone and email are optional contact details. No password or synthetic email address is created.

## Try the workflow

Open `http://localhost:4330/login` after `pnpm demo:up`. Sign in as an owner or manager using the locally configured credentials, then:

1. Open **Members**, choose the location and expand **Sell a member pass**.
2. Leave **Customer profile** selected. Search by name, phone or email and choose an existing profile, or expand **Create a customer**, enter a name and submit. The new profile is selected automatically.
3. Enter the vehicle, price and validity dates, then sell the pass. It remains pending until paid.
4. An owner or cashier with an open cash shift at that location collects the amount. The pass activates and links to its receipt. Renewals retain the same customer identity.

**Online account email** preserves the existing sale path for a registered account. It does not create an account for an unknown email. Customer search supports further pages, and keeps the selected profile when search results change. Creation and sale are separate forms with separate retry identities; ambiguous creation failures retain the same key for retry.

## Ownership and identity

`accounts.Customer` owns its name and optional contacts. `user` is an optional protected foreign key. Existing online customers retain their user link and profile IDs; new bookings still create a profile for their authenticated user as before.

Contact details are not verified identity. Matching an email or phone never merges profiles, attaches a login or grants access to existing history. A later online registration with the same contact remains separate. A verified account-claim process, profile editing and profile merging are deferred.

Only owners and managers can create or search profiles in the active organisation. The directory scopes before searching; a membership sale with another organisation's customer ID returns not found. Audit creation records only whether contacts are present, not their values. Membership read permissions and financial permissions retain their existing roles.

## API and code owners

- `GET /api/v1/customers`: cursor-paginated directory; optional `search` matches name, phone or email.
- `POST /api/v1/customers`: required `name`, optional `email` and `phone`; requires an `Idempotency-Key`. Replays return the same profile without another audit event.
- Membership sale accepts exactly one of `customerId` or the legacy `email`. Read responses include `customerId` and profile contacts; contact strings can be empty.

Backend creation/search lives in `backend/modules/accounts/customers.py`; membership orchestration stays in `billing/memberships.py`. The HTTP serializers and generated OpenAPI contract define the boundary. Frontend requests live in `app/customers.ts`; `CustomerPicker.tsx` owns search/selection/creation UI and `MembershipForms.tsx` owns sale state. These are domain components, not a new generic form framework.

## Migration and local evidence

Migration `accounts.0005` adds profile contacts and permits an unlinked customer. `0006` copies linked users' email addresses into profiles in batches, preserving profile names and IDs. Existing pass, booking and receipt references remain intact. No contact uniqueness or automatic linking is added.

A full PostgreSQL custom-format backup was taken before applying both migrations to the local synthetic demo. Before/after checks matched customer/user counts, sorted identity digests for passes, visits, reservations and receipts, payment count and captured totals. Linked profile email backfill had zero mismatches. Backup files and evidence stay in ignored `artifacts/tmp/`; a restore rehearsal has not been performed.

Deploy the migrations and new application writers together. This is not a certified rolling deployment. Reversing `0005` refuses to proceed while any unlinked customers exist, before contact columns are removed. Once walk-up profiles exist, use a forward fix or an explicitly planned data recovery rather than dropping their contacts to restore the old schema.

## Verification and limits

The completed milestone passed 116 frontend tests, 40 backend unit tests, 102 PostgreSQL integration tests, 11 existing Chromium checks and five live Django/PostgreSQL browser journeys. The new browser journey creates a name-only customer, sells and pays a pass on a 390px viewport, and verifies the unlinked profile, active pass and single ledger capture in PostgreSQL. Targeted migration tests cover preserved identities/backfill and refusal of destructive rollback. Lint, both TypeScript configurations, contract generation/check and production build passed.

The local gateway was rebuilt; authenticated directory access and name-only form validity were checked with desktop/mobile screenshots. The screenshot check did not submit a new demo sale. Browser workflows use an isolated test database.

Customer creation and pass transactions require a connection. Current PWA support caches the static shell only. Physical printers, production deployment, verified account claiming and the user's existing browser profile remain unverified or deferred. Open-lot zones and capacity are the next domain milestone.
