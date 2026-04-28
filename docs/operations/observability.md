# Observability

This project uses structured stdout logs everywhere and OpenTelemetry traces where explicitly enabled.

## Local development

Local logs are written to the terminal. The backend logger uses text output when `ENV=local` or `ENV` is unset.

Tracing is disabled by default:

```bash
OTEL_TRACES_EXPORTER=none
```

To inspect local spans in the terminal, run the backend with:

```bash
OTEL_TRACES_EXPORTER=stdout
```

## Staging and production

Staging and production run on Azure Container Apps with Azure Monitor Application Insights as the central telemetry surface.

The backend container sets:

```bash
OTEL_TRACES_EXPORTER=otlp
OTEL_SERVICE_NAME=backend
SERVICE_VERSION=<backend image tag>
```

The Container Apps managed OpenTelemetry agent injects the OTLP gRPC endpoint and protocol at runtime, then forwards traces to Application Insights. Container stdout/stderr logs continue to flow to the Log Analytics workspace through the Container Apps environment.

## Correlation

Request logs include `request_id` and, when tracing is active, `trace_id`. Use `trace_id` to move between backend JSON logs in Log Analytics and distributed trace views in Application Insights.

Backend outbound calls create client spans for platform dependencies such as Radio Browser, stream probes, metadata providers, and media blob storage. Dependency spans intentionally record host, scheme, path, method, status, and a stable `dependency.name`; they do not record full URLs or query strings because stream and blob URLs may carry tokens.

Useful starting points:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| where Log_s has "trace_id"
| order by TimeGenerated desc
```

```kusto
requests
| order by timestamp desc
```

```kusto
traces
| order by timestamp desc
```

```kusto
dependencies
| where cloud_RoleName == "backend"
| order by timestamp desc
```

## Azure Monitor Workbooks

Start the backend operations workbook with four tiles:

```kusto
requests
| where cloud_RoleName == "backend"
| summarize Requests=count(), Failed=countif(success == false), P95Ms=percentile(duration, 95) by bin(timestamp, 15m), name
| order by timestamp desc
```

```kusto
dependencies
| where cloud_RoleName == "backend"
| extend Dependency=tostring(customDimensions["dependency.name"])
| where Dependency != ""
| summarize Calls=count(), Failed=countif(success == false), P95Ms=percentile(duration, 95) by bin(timestamp, 15m), Dependency
| order by timestamp desc
```

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| extend Entry=parse_json(Log_s)
| where tostring(Entry.event) == "metadata_fetch_completed"
| summarize Fetches=count(), Unsupported=countif(tostring(Entry.status) != "ok"), P95Ms=percentile(todouble(Entry.latency_ms), 95) by bin(TimeGenerated, 15m), tostring(Entry.strategy)
| order by TimeGenerated desc
```

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| extend Entry=parse_json(Log_s)
| where tostring(Entry.event) == "database_pool_stats_recorded"
| project TimeGenerated, Acquired=toint(Entry.acquired_conns), Idle=toint(Entry.idle_conns), Max=toint(Entry.max_conns), Waits=toint(Entry.acquire_count), EmptyWaits=toint(Entry.empty_acquire_count), WaitMs=todouble(Entry.average_acquire_wait_ms)
| order by TimeGenerated desc
```

## Alert Starting Points

Use these as first production alert rules, then tune thresholds from staging baselines:

- Backend request failures: `requests` failure rate above 5% for 15 minutes, grouped by route `name`.
- Slow backend requests: `requests` p95 duration above the route-specific budget for 15 minutes.
- Dependency failures: `dependencies` failure rate above 10% for 15 minutes, grouped by `customDimensions["dependency.name"]`.
- Radio/metadata dependency latency: `dependencies` p95 duration above 5 seconds for `radio_browser_fetch`, `stream_probe`, or `metadata_*` dependencies.
- Database pool pressure: `database_pool_stats_recorded` logs where `acquired_conns == max_conns` or `average_acquire_wait_ms` rises above the staging baseline for 10 minutes.

## Logging rules

Do not log authorization headers, cookies, tokens, secrets, or raw stream URLs with query strings. Prefer stable identifiers such as `station_id`, `stream_id`, `request_id`, and `trace_id`.

Use event-shaped logs for platform workflows. The `event` field should be a stable machine-readable name such as `metadata_fetch_completed`, `stream_probe_completed`, or `http_request_completed`.

Database pool pressure is emitted once per minute by the backend with `event=database_pool_stats_recorded`. Use it for pool saturation checks after backend deploys:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| where Log_s has "database_pool_stats_recorded"
| order by TimeGenerated desc
```
