---
title: Inline media
description: Images, video, and audio rendered inline in messages.
order: 2
---

# Inline media

Messages can carry images, video, and audio that render inline — you do not need to download them to view them. Agents can also generate media (e.g. an image, a screen recording) and post it directly into a conversation.

## What renders inline

| Type | How it appears |
|---|---|
| **Images** (PNG, JPEG, WebP, GIF) | Inline `<img>`. Large images are downsampled for display; click to view full resolution. |
| **Video** (MP4, WebM) | Inline `<video>` player with play/pause, seeking, volume, fullscreen. |
| **Audio** (MP3, M4A, OGG) | Inline `<audio>` player with play/pause, seeking, volume. |

Every media element has a download link, so you can save the full-resolution file.

## How it stays private and safe

All media — uploaded files and any external URL the agent posts — is routed through the **media proxy**. This means:

- Your browser never directly hits external servers, so tracking pixels and IP leakage are prevented.
- Mixed-content warnings do not surface for non-HTTPS sources.
- The browser doesn't have to deal with cross-origin or authentication headers — the platform handles them.
- A Service Worker in the Chat app injects the platform auth token transparently for `media.<your-domain>` requests.

Files larger than the proxy's limit show as a download link rather than inline.

## Source kinds

Two sources for media:

- **External URLs** — anything an agent posts that points outside the platform. Resolved through the proxy.
- **Platform files** — referenced as `agyn://file/<file_id>`. These are files you uploaded into the conversation (see [Files](./files.md)) or files an agent generated through the Files service.

Either kind is rendered identically — you do not need to know where the bytes live.

## Unsupported formats

If a format does not render inline (e.g. a `.psd` image, a `.flac` audio file), the attachment appears as a card with the filename, content type, and a download link. The Chat app does not transcode media — only formats your browser natively supports render inline.

## Caching

Media is browser-cached using standard HTTP cache headers. After the first load, subsequent views are instant. The proxy sets cache lifetimes appropriately for the source.

## Related

- [Chat](./chat.md)
- [Files](./files.md)
- [Charts and diagrams](./charts-diagrams.md)
