# S077 consent fields on the website forms, November 2026 (F4)

Checked on 2–3 Nov 2026 against `origin/main` at `b88ca73`. Report only: the field names agree with the drafts, so no form changes are needed.

**Sources (read-only):**
- S076 Commercial Electronic Messaging and Consent Procedure, DRAFT Rev01 (1 Nov 2026), sections 3, 4 and 9;
- S077 Marketing Consent and Unsubscribe Register, DRAFT Rev01 (1 Nov 2026), README and Consent sheet;

both from the solicitor send pack in `00_CONTROL_REFERENCE\01_CONTROL_SPINE\SOLICITOR_SEND_2026-11_DRAFT`. The copies in `SOLICITOR_SEND_Addendum_B_DRAFT` are byte-identical.

The path a lead takes: the website form, then the storefront's `/api/lead` (SiteGuard-Forms-Storefront `lib/create-app.js`), then the lead notification email (`lib/mailer.js`), then the CRM (siteguard-ai `siteguard_org/growth.py`, `parse_lead_notification` and `_record_form_consent`). S077 says the CRM is the source of truth and the workbook is exported from it.

## Register interest (`/register-interest/`, `enquiry_type=app-interest`)

| S077 Consent sheet column (S076 section) | Website field sent | Storefront records | CRM records | Agrees? |
|---|---|---|---|---|
| Consent basis (section 3: express, existing_customer, published_role, introduced, enquiry, none) | `consent` = `yes` only when the box is ticked (unticked by default) | `consent_basis` = `express` if `consent` is `yes`, otherwise `enquiry` | `consent_basis`. Only `express` or `enquiry` is accepted from a form; express is accepted only from the storefront's own notification, and a stronger basis already held is never downgraded | Yes |
| Source method (section 4: published_page, **web_form**, referral, customer, event) | none (implied by the form) | `consent_method` = `"website form"` | method `web_form`; the storefront's text is kept in the record's detail | Yes, in the CRM (see note 1) |
| Source (page URL or event) | `consent_source` = `https://www.siteguardsystems.com.au/register-interest/` | `consent_source`, or the Referer if it's missing | consent record `source` | Yes |
| Date captured | none: the server sets it | `consent_at` (server time, ISO 8601) | `captured_on` and `captured_at` | Yes |
| Recorded by | none | none | `"website form (storefront /api/lead)"` | Yes |
| (S076 section 2: what the person agreed to) | `consent_wording`: the exact text beside the box, sent only when it's ticked | `consent_wording`, blanked unless the basis is express | consent record `wording` | Yes |
| Offer line | `enquiry_type=app-interest`, `interest` (app, audit or both) | kept | offer line `app_selfserve`; `interest` in the detail | Yes |
| Wave eligible (W0 / W1 / W2) | none | none | not set from the form | Gap (see note 2) |
| Unsubscribe date, Channel suppressed | not applicable (set on unsubscribe) | — | suppression list | — |

The wording beside the box is: "Email me about the SiteGuard App and SiteGuard Audit: when founding places and the app open, and the founding offer. I can unsubscribe at any time." It's opt-in (unticked by default), names what the emails are about, and says the person can unsubscribe, as S076 section 3 ("Express") expects. Without the box ticked, the lead is an enquiry: reply only, no sequence.

## Enquiry form (`/contact/` and every "Send an enquiry" button)

The form sends `name`, `email`, `company`, `phone`, `need` and the honeypot `website`, with `enquiry_type` set to `enquiry` by the script. It has no consent box and sends no consent fields. That agrees with S076 section 3: someone who contacted SiteGuard is an **enquiry** basis (reply only, no sequence until they give express consent). The CRM records new enquiries as `enquiry` (`capture_website_lead`). The form's note says "We use these details only to reply to you", which matches. The partner form (`/partners/`, `enquiry_type=partner`) is the same.

## Notes for Dan

1. **Method name.** The storefront stores `consent_method` as the words "website form"; S077's list uses the code `web_form`. The CRM already writes `web_form` into the consent record, so the register is right. Changing the storefront to send `web_form` would make the lead email and the register read the same. It's a storefront change, not a website one.
2. **Wave eligible.** S077 Rev01 added a "Wave eligible (W0 / W1 / W2)" column. Neither the form nor the CRM fills it from a Register-interest lead. Under S076 sections 5 and 6, express consent from this form makes the person eligible for W0 (founding) and W2 (app self-serve), because the wording names founding places and the app. It's for the CRM to derive. The website has nothing to add.
3. **Without JavaScript**, the form posts directly to `/api/lead`, and the hidden `consent_wording` goes with it whether or not the box is ticked. The storefront blanks the wording unless `consent` is `yes`, so nothing is recorded wrongly. The storefront's tests cover this ("no box ticked is an enquiry basis with no wording").
4. **Both documents are DRAFT** (pending the solicitor). If the solicitor changes the consent wording or the register's columns, `CONSENT_WORDING` in `build.mjs` and this mapping need the same change.
