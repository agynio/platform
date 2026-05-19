---
title: Apps
description: Install, configure, and publish apps.
order: 19
---

# Apps

An app is an independently deployed service that interacts with conversations on behalf of external systems or platform capabilities. Apps come in two flavors:

- **Platform apps** — built by the Agyn team or your own engineering team to provide capabilities to agents. Example: [Reminders](./reminders-app.md).
- **3rd-party bridges** — apps that connect external products to platform conversations. Example: [Telegram Connector](./telegram-connector.md).

An organization can install apps from the apps catalog (public apps) or from internal app definitions (apps published by your own organization).

## Install an app

### In the Console

1. Console → **Apps** (`/organizations/<org>/apps`).
2. Open the **Available** tab — every app you can install.
3. Click an app to see its description, required permissions, and configuration schema.
4. Click **Install**.
5. Provide the required configuration values (varies per app — typically credentials and identifiers for the external system).
6. Approve the requested permissions.
7. Save.


The app moves to the **Installed** tab. It can now participate in conversations in this organization.

### With Terraform

```hcl
resource "agyn_app_installation" "telegram" {
  organization_id = agyn_organization.acme.id
  app_slug        = "telegram-connector"

  configuration = jsonencode({
    bot_token = var.telegram_bot_token
  })

  permissions = ["thread:create", "participant:add", "message:send"]
}
```

Permissions declared in `permissions` must match the app's required permissions.

## Configure an installed app

### In the Console

1. Apps → **Installed** tab → click the installation.
2. The detail page shows:
   - **Slug** — the app identifier used for routing.
   - **Address** — where the app reaches the platform.
   - **Configuration** — JSON config you can edit.
   - **Permissions** — which capabilities you've granted.
   - **Status** — last reported state, if the app reports one.
   - **Audit log** — a ring buffer of the last 1000 events the app emitted (paginated).
3. Edit configuration or permissions in place.


Changes apply on the app's next state sync — typically within seconds.

### With Terraform

Update the resource block and apply. The app receives the updated configuration on its next refresh.

## Uninstall

Uninstalling an app:

- Revokes the app's permissions on the organization.
- Removes the app as a participant from active conversations (the app sees a leave event).
- Preserves message history — past messages from the app remain.

### In the Console

1. Installed apps → installation → kebab menu → **Uninstall**.
2. Confirm.

### With Terraform

Delete the resource block and apply.

## Publish your own app

Apps your organization owns appear in the **Published** tab. You can publish apps for use:

- **Internal** — only your organization can install. Useful for organization-specific tooling.
- **Public** — any organization can install. Useful for third-party connectors you offer.

### In the Console

1. Console → **Apps → Published tab**.
2. Click **New app**.
3. Set:
   - **Name**.
   - **Slug** — short identifier.
   - **Description**.
   - **Visibility** — `internal` or `public`.
   - **Required permissions** — what the app will request from installing orgs.
   - **Configuration schema** — JSON schema describing the configuration fields users will fill in.
4. Save.


The Console returns a **service token** — copy it now, it's not retrievable later. Provide it to the running app so it can enroll.

After publishing, the **Installations** sub-tab lists every organization that has installed your app, across the platform.

### With Terraform

```hcl
resource "agyn_app" "company_kb_bot" {
  organization_id = agyn_organization.acme.id

  name        = "Company KB Bot"
  slug        = "company-kb-bot"
  description = "Bridge to internal knowledge base."
  visibility  = "internal"

  required_permissions = ["thread:create", "message:send"]

  configuration_schema = jsonencode({
    type = "object"
    properties = {
      kb_url = { type = "string" }
    }
    required = ["kb_url"]
  })
}
```

To build the app itself — the service that processes the events — see [Build & extend → Apps](../build-extend/apps.md).

## Cluster-scoped apps

Cluster admins can publish apps as cluster-scoped, making them available everywhere. The Reminders app is typically published this way. See [Cluster administration → Apps](./cluster-administration.md#cluster-scoped-apps).

## Related

- [Reminders app](./reminders-app.md)
- [Telegram Connector](./telegram-connector.md)
- [Build & extend → Apps](../build-extend/apps.md) — write your own.
