/**
 * Temporary instrumentation for the Clerk sign-in investigation.
 *
 * Wraps window.fetch before clerk-js loads and forwards every Clerk
 * frontend-API response that carries an error (or any 4xx/5xx) to
 * /api/debug-log so the failure can be read server-side without
 * opening devtools. Delete together with the debug-log route once
 * the bug is fixed.
 */
export function ClerkDebugBootScript() {
  const code = `
    (function () {
      var originalFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        return originalFetch.apply(this, args).then(function (response) {
          try {
            if (url.indexOf("/v1/") !== -1 && url.indexOf("debug-log") === -1) {
              var clone = response.clone();
              clone.text().then(function (body) {
                var hasErrors = body.indexOf('"errors"') !== -1 && body.indexOf('"errors":null') === -1;
                if (response.status >= 400 || hasErrors) {
                  originalFetch("/api/debug-log", {
                    method: "POST",
                    body: JSON.stringify({
                      page: window.location.pathname,
                      status: response.status,
                      url: url.split("?")[0],
                      body: body.slice(0, 4000),
                      at: new Date().toISOString(),
                    }),
                  }).catch(function () {});
                }
              }).catch(function () {});
            }
          } catch (e) {}
          return response;
        });
      };
    })();
  `;

  /* biome-ignore lint/security/noDangerouslySetInnerHtml: required for pre-hydration debug hook */
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
