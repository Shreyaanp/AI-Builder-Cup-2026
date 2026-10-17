# Looker Studio impact dashboard (setup, about 10 minutes)

The dashboard reads the same BigQuery dataset the app uses for owner analytics:
`ichiropractic.chalkboard_analytics` (asia-south1). Looker Studio is set up in the browser; there
is no API for building reports, so these are the exact clicks. Data is aggregated per shop and day
with no names, owner IDs or customer details (see [architecture.md](../architecture.md)).

## What is in the dataset

| Table / view                                | One row per                               | Use                                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_daily` (table, partitioned by `date`) | shop × day                                | Sales (`sales_minor`, minor currency units), `items_sold`, `questions`, `page_views`, `stamps`, `returning`, `forecast_units` vs `actual_units`; `demo` marks seeded demo shops |
| `impact_daily` (view)                       | day × country × currency × demo           | Headline totals: shops, shops with sales, sales, questions, page views, stamps, forecast WAPE                                                                                   |
| `forecast_accuracy` (view)                  | shop × day with both a forecast and sales | Forecast error per shop day (`abs_pct_error`)                                                                                                                                   |
| `latency_daily` (view)                      | day × method × route                      | Requests, server errors, p50/p95 latency in ms, from the Cloud Run request-log sink (no IPs, user agents or query strings)                                                      |

`shop_daily` is refreshed nightly at 00:30 UTC by Cloud Scheduler job
`chalkboard-analytics-export` (exports the two previous UTC days). A backfill or manual run:
`backend/scripts/analytics_export.py --days 30` (see the handoff).

## 1. Create the report with the first data source

Open this link while signed in as the project owner. It creates a new report already connected to
`impact_daily`:

<https://lookerstudio.google.com/reporting/create?ds.ds0.connector=bigQuery&ds.ds0.type=TABLE&ds.ds0.projectId=ichiropractic&ds.ds0.datasetId=chalkboard_analytics&ds.ds0.tableId=impact_daily&ds.ds0.billingProjectId=ichiropractic&r.reportName=Chalkboard%20impact>

Click **Edit and share** → **Acknowledge and save**. Name the data source `impact_daily`.

## 2. Add the other data sources

**Resource → Manage added data sources → Add a data source → BigQuery → My projects →
ichiropractic → chalkboard_analytics**, then add `forecast_accuracy` and `latency_daily` the same way.

## 3. Page 1, "Impact" (data source `impact_daily`)

1. **Theme and layout**: Theme → _Simple Light_; page size 1200 × 900.
2. **Control: demo filter.** Add a control → _Drop-down list_, field `demo`, default value `false`
   (judges see real shops; switch to `true` to see the seeded demo world).
3. **Control: date range.** Add a control → _Date range control_, default _Last 28 days_.
4. **Scorecards** (Add a chart → Scorecard), one each, with _Compare to previous period_ on:
   - `shops` (aggregation Max), label "Shops"
   - `shops_with_sales` (Max), label "Shops recording sales"
   - `questions` (Sum), label "Customer questions"
   - `page_views` (Sum), label "Customer page visits"
   - `stamps` (Sum), label "Passport stamps"
5. **Time series**: dimension `date`; metrics `page_views`, `questions`, `stamps` (Sum). Title
   "Customer activity".
6. **Time series**: dimension `date`; metric `forecast_wape` (Average), number format Percent.
   Title "Forecast error (WAPE, lower is better)".
7. **Table**: dimensions `country`, `currency`; metrics `sales_minor` (Sum), `items_sold` (Sum).
   Title "Sales by market (minor currency units)". Do not add sales across currencies.

## 4. Page 2, "Forecast" (data source `forecast_accuracy`)

1. Add the same demo and date controls (Page → _Make report-level_ on the page 1 controls is
   quicker).
2. **Bar chart**: dimension `category`; metric `abs_pct_error` (Average), Percent. Title "Forecast
   error by shop type".
3. **Scatter chart**: dimension `shop_key`; metrics `forecast_units` (Sum) and `actual_units` (Sum).
   Title "Forecast vs sold (per shop)".

## 5. Page 3, "Speed" (data source `latency_daily`)

1. **Table with heatmap**: dimension `route`; metrics `requests` (Sum), `p50_ms` (Average),
   `p95_ms` (Average), `server_errors` (Sum). Sort by `requests` descending, 20 rows.
2. **Time series**: dimension `date`; metric `p95_ms` (Average). Add a filter
   `route` _Contains_ `/coach` to show the coach, or leave it off for the whole app.
3. Note on the page (Text box): "Streaming routes (message threads, coach streams) stay open by
   design, so their latency is connection length, not response time."

## 6. Share and link

**Share → Manage access → Anyone with the link can view** (viewers do not need BigQuery access;
the report uses the owner's credentials by default). Copy the link into
[docs/PRODUCT-STATUS.md](../PRODUCT-STATUS.md) and the submission. To give someone a copy as a
template, they open the report and use **⋮ → Make a copy**, choosing their own BigQuery tables.

## Cost

Each chart load runs a small query (the dataset is a few thousand rows; BigQuery bills a 10 MB
minimum per query, within the free 1 TB/month). Looker Studio caches results for 12 hours by
default (Resource → Manage added data sources → Edit → Data freshness).
