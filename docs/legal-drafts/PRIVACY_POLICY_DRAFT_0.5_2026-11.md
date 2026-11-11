# DRAFT FOR THE SOLICITOR: Privacy Policy SG-LEGAL-04, proposed version 0.5

> **NOT PUBLISHED. NOT LEGAL ADVICE.** A drafting proposal by Claude Code for the overnight
> run of 8–9 Nov 2026 (Remaining build queue W8). It's for Dan to review and send to the
> solicitor. The live policy is `content/legal/privacy.md` (version 0.4), copied from
> SiteGuard-Forms by `npm run sync-legal`. Once approved, this wording goes into the
> **SiteGuard-Forms legal source**, and the sync carries it to both sites. Don't edit
> `content/legal/privacy.md` here.
>
> **Why now:** version 0.4 says "We don't use analytics or advertising tools on our sites."
> That is true today, because everything below is built **off**. It stops being true when Dan
> switches on any of:
> - the Cloudflare beacon (W2, M1);
> - the campaign counts (W3, M2);
> - the Google Ads tag (W5, M9);
> - the unsubscribe page (W1, U1).
>
> Each switch should wait until the solicitor-approved wording is live.

## Proposed changes

Each change shows the section, the 0.4 text and the proposed text. Where a point is
uncertain, it's marked **[For the solicitor]**. Nothing is guessed as settled.

### Front matter

- `version: "0.5"`, `date:` the approval date, `status:` as the solicitor directs.

### §1 What we collect: replace the "Technical information" bullet

**0.4:** "Technical information: IP address, browser and device type, and pages visited,
collected by our hosting and security provider (Cloudflare) and server logs, for security and
to keep the sites working. We don't use analytics or advertising tools on our sites."

**Proposed:**

- **Technical information:** IP address, browser and device type, and pages visited, collected
  by our hosting and security provider (Cloudflare) and server logs, for security and to keep
  the sites working.
- **Website analytics (no cookies):** we use Cloudflare Web Analytics to count page views and
  see how our sites perform. It doesn't use cookies or local storage, and it doesn't build a
  profile of you. Cloudflare processes the visit data (such as the page, referring site,
  browser and country) on our behalf, and we see totals, not individuals.
  **[For the solicitor]** Cloudflare's own description of the data its beacon collects should
  be checked against this sentence when it's approved.
- **Campaign counts (no cookies):** when you arrive from one of our marketing links (a link
  with "utm" tags naming the source, medium and campaign), our website adds one to a daily
  count for that campaign. We store only the date, the campaign tags and the number of visits
  (and, where the link came from a Google ad, how many visits it brought). We don't store your
  IP address, a cookie, your browser or anything else about you with the count. If you then
  send an enquiry in the same visit, the campaign tags go with the enquiry, so we can count
  enquiries per campaign. They're kept in your browser for that visit only (session storage),
  never in a cookie.
- **Advertising measurement (only when switched on):** if we advertise with Google Ads, our
  sites may load the Google tag. It uses cookies and similar technologies to tell us when an ad
  led to an enquiry or a call request ("conversions"), and Google uses the data under its own
  terms and privacy policy. While the Google tag is off, no advertising cookie is set. You can
  control Google's ad personalisation at adssettings.google.com and block cookies in your
  browser.
  **[For the solicitor]** Two questions here:
  1. Does this need a cookie notice or a consent banner on the sites? Australia has no
     general cookie-consent law, but the Privacy Act review and Google's own policies may
     expect one.
  2. Should Google Consent Mode be set to deny storage until a visitor agrees?

### §2 Why we collect it: add, after "...keep our systems secure;"

> "understand which of our marketing works (counts, not individuals);"

### New §2A Unsubscribing and the unsubscribe record

> "Every marketing and outreach email we send includes a one-click unsubscribe link and the
> option to reply 'unsubscribe'. The link names you by a coded reference, not your email
> address. When you unsubscribe, we record that reference and the time, and we add you to our
> do-not-contact list. We keep that record permanently, so we never email you again. That
> includes contacting you through a different list. The record is held by Cloudflare (D1
> database, our website's host) until our own systems collect it, then in our customer records
> in Australia."

**[For the solicitor]**
1. Does keeping a permanent suppression record need its own retention statement under APP 11?
2. Does the Spam Act 2003 unsubscribe wording ("functional unsubscribe facility") need anything
   more?

### §3 Who we share it with: table changes

| Provider | Purpose | Where data may be held |
|---|---|---|
| Cloudflare | Website hosting, delivery and security; cookie-less web analytics; campaign counts and the unsubscribe record (D1) | Global network |
| Google (only if the Google Ads tag is switched on) | Advertising measurement (conversions) | USA and other countries |

(The other rows stay as in 0.4.)

**Not in this draft:** the Microsoft 365 outreach mailboxes and the Google Business Profile
links. Neither changes what personal information we collect from site visitors. The Google
review links are plain links to Google, with no Google content on our pages (decision N3).

### §4 Overseas disclosure

No wording change. **[For the solicitor]** Confirm that "mainly in the USA" still covers Google
(Ads) and Cloudflare D1 (Cloudflare chooses the D1 location unless one is set).

### §7 Access, correction and complaints

Change the contact to **support@siteguardsystems.com.au** (decision N1, 8 Nov 2026), or keep
hello@ for privacy matters. **[For Dan]** Which address should privacy requests go to?

## Checklist before any of these is switched on

1. The solicitor approves the wording (or their changes).
2. Dan updates the policy in the SiteGuard-Forms legal source (version 0.5) and runs the legal
   sync to both sites.
3. Only then, set the relevant build setting or binding: `CF_WEB_ANALYTICS_TOKEN`, the
   `METRICS_DB` binding, the `UNSUB_DB` binding with the secret, or `GOOGLE_ADS_TAG=on`.
