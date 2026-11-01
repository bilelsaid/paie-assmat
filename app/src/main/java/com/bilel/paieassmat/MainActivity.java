package com.bilel.paieassmat;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;

public class MainActivity extends Activity {
    // Origine https propre à l'appli : IndexedDB y est stockée de façon durable dans les données de l'appli.
    private static final String HOST = "app.local";
    private static final int REQ_EXPORT = 41, REQ_IMPORT = 42, REQ_EXPORT_BIN = 43;
    private static final int MAX_BIN = 5 * 1024 * 1024;
    private WebView web;
    private String pendingExport;
    private byte[] pendingBinary;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())) {
                    String p = u.getPath();
                    if (p == null || p.equals("/")) p = "/index.html";
                    try {
                        InputStream in = getAssets().open(p.substring(1));
                        return new WebResourceResponse(mime(p), "UTF-8", in);
                    } catch (IOException e) {
                        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
                    }
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("https://" + HOST + "/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    private void callJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_EXPORT) {
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    out.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            pendingExport = null;
            callJs("window.onExportResult(" + ok + ")");
        } else if (req == REQ_EXPORT_BIN) {
            boolean ok = false;
            if (res == RESULT_OK && data != null && data.getData() != null && pendingBinary != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    out.write(pendingBinary);
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            pendingBinary = null;
            callJs("window.onBinaryExportResult(" + ok + ")");
        } else if (req == REQ_IMPORT) {
            String text = null;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 20 * 1024 * 1024) throw new IOException("trop gros");
                        bo.write(buf, 0, n);
                    }
                    text = new String(bo.toByteArray(), StandardCharsets.UTF_8);
                } catch (Exception ignored) {
                }
            }
            callJs("window.onImportFile(" + (text == null ? "null" : JSONObject.quote(text)) + ")");
        }
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private class Bridge {
        @JavascriptInterface
        public void exportFile(final String name, final String json) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingExport = json;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(i, REQ_EXPORT);
                }
            });
        }

        // PDF / PNG du récapitulatif (F10) : contenu en base64, écrit dans le document choisi par l'utilisateur.
        @JavascriptInterface
        public void exportBinary(final String name, final String mime, final String base64) {
            byte[] bytes = null;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
                if (bytes.length > MAX_BIN) bytes = null;
            } catch (Exception ignored) {
            }
            if (bytes == null) {
                callJs("window.onBinaryExportResult(false)");
                return;
            }
            final byte[] data = bytes;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingBinary = data;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/pdf".equals(mime) || "image/png".equals(mime) ? mime : "application/octet-stream");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(i, REQ_EXPORT_BIN);
                }
            });
        }

        @JavascriptInterface
        public void importFile() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, REQ_IMPORT);
                }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "Partager le résultat"));
                }
            });
        }
    }
}
