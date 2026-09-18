# Add/Update Snaplex dialog — proposed tooltips

Draft tooltip copy for every field/control across the dialog's four tabs. Tooltips
already drafted in `admin-manager/add-update-snaplex-dialog/comparison.html` are
carried over verbatim; the rest are new drafts for this pass.

| Tab | Field/control | Proposed tooltip |
|---|---|---|
| Settings | Name | Enter a unique name to identify this Groundplex in Admin Manager. |
| Settings | Runtime environment ID | Required. Combines with Location to form this Groundplex's runtime path — nodes bind to their Snaplex by matching this value, so it must match on all nodes. Changing it after nodes are running breaks their binding; to rename, create a new Snaplex and migrate pipelines instead. |
| Settings | Location | Select sidekick (Groundplex). |
| Settings | Select project | Select the shared folder to allow access to all users. Select a Project to limit access to users who have permissions for that Project. |
| Settings | Version | Select the Snaplex software version this Groundplex's nodes should run. |
| Settings | Load balancer | If left blank, Triggered Tasks use the Ultra load balancer URL if one is set, or fall back to the Control Plane's cloud URL otherwise. For APIM, SnapLogic's best practices require the Snaplex or an Alternative URL — set this field to avoid the cloud URL. Example: https://\<groundplex-load-balancer\>.com |
| Settings | Ultra load balancer | Required for Ultra Tasks. If left blank, no run URL is set and Ultra Tasks will fail to execute. |
| Settings | Emails (Groundplex notifications) | Specify a comma-separated list of emails to receive notifications from this Groundplex. |
| Settings | Slack channels (Groundplex notifications) | Specify a comma-separated list of Slack channels to receive notifications from this Groundplex. |
| Settings | Slack users (Groundplex notifications) | Specify a comma-separated list of Slack users to receive notifications from this Groundplex. |
| Logging | Level | Set the minimum severity of log messages to save. Lower levels (like Debug) capture more detail but use more disk space. |
| Logging | Log file size | Set the maximum size for each log file to reach before it rotates. Use the Metric field to choose the unit (MiB or GiB). |
| Logging | Metric | Set the unit for Log file size: MiB or GiB. |
| Logging | Main backup count | Set the number of rotated main log files to keep before the oldest is deleted. |
| Logging | Error backup count | Set the number of rotated error log files to keep before the oldest is deleted. |
| Logging | Access backup count | Set the number of rotated access log files to keep before the oldest is deleted. |
| Node properties | Max. slots | Set the maximum number of pipelines that can run at the same time across this Groundplex's nodes. |
| Node properties | Reserved slot % | A slot is a unit of pipeline execution capacity. Set the percentage of this Groundplex's slots reserved for Ultra Tasks, keeping them available even when other slots are full. |
| Node properties | Max. memory | Set the maximum percentage of available system memory a node can use before it starts throttling new pipeline executions. |
| Node properties | Max. restart wait time | Set how long a node waits for running pipelines to finish before it restarts. Toggle "Forever" to disable automatic restarts and always wait. |
| Node properties | Max. heap size | Set the maximum JVM heap size per node. Leave as "auto" to let the JCC calculate size based on available system memory. |
| Node properties | HTTP Interface | Set whether the node's local HTTP endpoint accepts connections from any network interface (0.0.0.0) or only from the node itself (127.0.0.1). |
| Node properties | HTTP Port | Set the port the node's local HTTP endpoint listens on. |
| Node properties | HTTPS Port | Set the port the node's local HTTPS endpoint listens on. Leave blank to disable HTTPS on this node. |
| Node properties | Snaplex node types — Hostname | Enter the hostname of the machine on which a node will run to configure a FeedMaster. |
| Node properties | Snaplex node types — Server type | Select FeedMaster to override this node's default JCC role. |
| Node properties | Global properties — Key | Enter a name for a property to configure on this Groundplex's nodes. |
| Node properties | Global properties — Value | Enter the value for this property. |
| Node proxies | HTTP proxy host name | Enter the hostname or IP address of your organization's proxy server for outbound HTTP traffic from this Groundplex's nodes. |
| Node proxies | Port (HTTP) | Enter the port your organization's HTTP proxy server listens on. |
| Node proxies | Non-proxy host pattern (HTTP) | Enter a hostname pattern that should bypass the HTTP proxy and connect directly instead — for example, `*.internal.example.com` to exclude all subdomains of an internal network. |
| Node proxies | HTTPS proxy host name | Enter the hostname or IP address of your organization's proxy server for outbound HTTPS traffic from this Groundplex's nodes. |
| Node proxies | Port (HTTPS) | Enter the port your organization's HTTPS proxy server listens on. |
| Node proxies | Non-proxy host pattern (HTTPS) | Enter a hostname pattern that should bypass the HTTPS proxy and connect directly instead — for example, `*.internal.example.com` to exclude all subdomains of an internal network. |
