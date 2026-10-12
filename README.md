# xahauindex-examples

Static browser examples for the public [XahauIndex](https://xahauindex.dev) API. No API key and no Node.js app. Each example is one directory of HTML, CSS, and JavaScript that calls the API directly.

API docs: <https://xahauindex.dev/docs>

## Examples

### Token platform

Directory: [`token-platform`](token-platform)

A token directory with a market view for the token you open.

- Landing page lists IOU tokens from `GET /v1/tokens`, one page at a time
- Search, verified-domain filter, and sort
- Token detail shows the issuer profile and the embedded 24h XAH-pair summary
- Tabs list pairs found on that token’s trade tape
- OHLCV chart loads for the active pair and period only
- Responses stay in an in-memory cache for the browser session

Open [`token-platform/index.html`](token-platform/index.html) in a browser.

If the browser blocks API calls from a file on disk, serve the `token-platform` folder with any static file server and open the local address.

## Adding an example

Add a directory of static files that call `https://xahauindex.dev` from the browser. Then add a section above with the directory name, what the example shows, and how to open it.
