package betaflight.app.file;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "BetaflightFile")
public class BetaflightFilePlugin extends Plugin {

    private static final String TAG = "BetaflightFile";

    /**
     * Tracks an open file: its content:// URI, display name, and optional
     * OutputStream for streaming writes.
     */
    private static class OpenFile {
        final Uri uri;
        final String name;
        OutputStream outputStream;

        OpenFile(Uri uri, String name) {
            this.uri = uri;
            this.name = name;
        }
    }

    /** Open files keyed by opaque fileId (UUID string). Thread-safe because
     *  @PluginMethod runs on the CapacitorPlugins thread while @ActivityCallback
     *  and handleOnDestroy run on the main thread. */
    private final ConcurrentHashMap<String, OpenFile> openFiles = new ConcurrentHashMap<>();

    // ---------------------------------------------------------------
    // Extension → MIME mapping
    // ---------------------------------------------------------------

    private static final Map<String, String> EXTENSION_MIME_MAP = new HashMap<>();
    static {
        EXTENSION_MIME_MAP.put(".txt",  "text/plain");
        EXTENSION_MIME_MAP.put(".json", "application/json");
        EXTENSION_MIME_MAP.put(".hex",  "application/octet-stream");
        EXTENSION_MIME_MAP.put(".uf2",  "application/octet-stream");
        EXTENSION_MIME_MAP.put(".bbl",  "application/octet-stream");
        EXTENSION_MIME_MAP.put(".mcm",  "application/octet-stream");
        EXTENSION_MIME_MAP.put(".png",  "image/png");
        EXTENSION_MIME_MAP.put(".bmp",  "image/bmp");
        EXTENSION_MIME_MAP.put(".lua",  "text/plain");
        EXTENSION_MIME_MAP.put(".csv",  "text/csv");
    }

    private String mimeForExtension(String ext) {
        if (ext == null) return "*/*";
        String lower = ext.toLowerCase(java.util.Locale.ROOT);
        if (!lower.startsWith(".")) lower = "." + lower;
        String mime = EXTENSION_MIME_MAP.get(lower);
        return mime != null ? mime : "*/*";
    }

    // ---------------------------------------------------------------
    // openFile  –  ACTION_OPEN_DOCUMENT
    // ---------------------------------------------------------------

    @PluginMethod
    public void openFile(PluginCall call) {
        String mimeType = call.getString("mimeType", "*/*");
        JSArray extensions = call.getArray("extensions");

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);

        if (extensions != null && extensions.length() > 0) {
            try {
                String[] mimeTypes = new String[extensions.length()];
                for (int i = 0; i < extensions.length(); i++) {
                    mimeTypes[i] = mimeForExtension(extensions.getString(i));
                }
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            } catch (Exception e) {
                Log.w(TAG, "Failed to parse extensions", e);
            }
        }

        startActivityForResult(call, intent, "openFileResult");
    }

    @ActivityCallback
    private void openFileResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            Log.e(TAG, "openFileResult: PluginCall is null");
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("No URI returned from file picker");
            return;
        }

        String name = queryDisplayName(uri);
        String fileId = UUID.randomUUID().toString();
        openFiles.put(fileId, new OpenFile(uri, name));

        JSObject ret = new JSObject();
        ret.put("fileId", fileId);
        ret.put("name", name);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // saveFile  –  ACTION_CREATE_DOCUMENT
    // ---------------------------------------------------------------

    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = call.getString("fileName", "file");
        String mimeType = call.getString("mimeType", "*/*");
        JSArray extensions = call.getArray("extensions");

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        if (extensions != null && extensions.length() > 0) {
            try {
                String[] mimeTypes = new String[extensions.length()];
                for (int i = 0; i < extensions.length(); i++) {
                    mimeTypes[i] = mimeForExtension(extensions.getString(i));
                }
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            } catch (Exception e) {
                Log.w(TAG, "Failed to parse extensions", e);
            }
        }

        startActivityForResult(call, intent, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            Log.e(TAG, "saveFileResult: PluginCall is null");
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("No URI returned from save picker");
            return;
        }

        String name = queryDisplayName(uri);
        String fileId = UUID.randomUUID().toString();
        openFiles.put(fileId, new OpenFile(uri, name));

        JSObject ret = new JSObject();
        ret.put("fileId", fileId);
        ret.put("name", name);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // pickDirectory  –  ACTION_OPEN_DOCUMENT_TREE
    // ---------------------------------------------------------------

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "pickDirectoryResult");
    }

    @ActivityCallback
    private void pickDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            Log.e(TAG, "pickDirectoryResult: PluginCall is null");
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("No URI returned from directory picker");
            return;
        }

        // Persist access across app restarts
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (SecurityException e) {
            Log.e(TAG, "Failed to persist directory permission", e);
            call.reject("Failed to persist directory permission: " + e.getMessage());
            return;
        }

        String name = queryTreeDisplayName(treeUri);

        JSObject ret = new JSObject();
        ret.put("directoryUri", treeUri.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // getPersistedDirectories
    // ---------------------------------------------------------------

    @PluginMethod
    public void getPersistedDirectories(PluginCall call) {
        List<android.content.UriPermission> permissions =
                getContext().getContentResolver().getPersistedUriPermissions();

        JSArray directories = new JSArray();
        for (android.content.UriPermission perm : permissions) {
            if (perm.isReadPermission()) {
                Uri uri = perm.getUri();
                JSObject entry = new JSObject();
                entry.put("uri", uri.toString());
                entry.put("name", queryTreeDisplayName(uri));
                directories.put(entry);
            }
        }

        JSObject ret = new JSObject();
        ret.put("directories", directories);
        call.resolve(ret);
    }

    // ---------------------------------------------------------------
    // releaseDirectory
    // ---------------------------------------------------------------

    @PluginMethod
    public void releaseDirectory(PluginCall call) {
        String uriStr = call.getString("directoryUri");
        if (uriStr == null) {
            call.reject("directoryUri is required");
            return;
        }

        try {
            Uri uri = Uri.parse(uriStr);
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContext().getContentResolver().releasePersistableUriPermission(uri, flags);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to release directory permission", e);
            call.reject("Failed to release directory: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------
    // readFile  –  read entire file as UTF-8 string
    // ---------------------------------------------------------------

    @PluginMethod
    public void readFile(PluginCall call) {
        String fileId = call.getString("fileId");
        OpenFile file = getOpenFileOrReject(call, fileId);
        if (file == null) return;

        try {
            byte[] bytes = readAllBytes(file.uri);
            String text = new String(bytes, "UTF-8");

            JSObject ret = new JSObject();
            ret.put("data", text);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readFile failed", e);
            call.reject("Failed to read file: " + e.getMessage());
        } finally {
            openFiles.remove(fileId);
        }
    }

    // ---------------------------------------------------------------
    // readFileAsBlob  –  read entire file, return as hex string
    // ---------------------------------------------------------------

    @PluginMethod
    public void readFileAsBlob(PluginCall call) {
        String fileId = call.getString("fileId");
        OpenFile file = getOpenFileOrReject(call, fileId);
        if (file == null) return;

        try {
            byte[] bytes = readAllBytes(file.uri);
            String hex = byteArrayToHexString(bytes);

            JSObject ret = new JSObject();
            ret.put("data", hex);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "readFileAsBlob failed", e);
            call.reject("Failed to read file as blob: " + e.getMessage());
        } finally {
            openFiles.remove(fileId);
        }
    }

    // ---------------------------------------------------------------
    // writeFile  –  atomic write (string or hex-encoded binary)
    // ---------------------------------------------------------------

    @PluginMethod
    public void writeFile(PluginCall call) {
        String fileId = call.getString("fileId");
        String data = call.getString("data", "");
        String encoding = call.getString("encoding", "utf8");

        OpenFile file = getOpenFileOrReject(call, fileId);
        if (file == null) return;

        try {
            byte[] bytes;
            if ("hex".equals(encoding)) {
                bytes = hexStringToByteArray(data);
            } else {
                bytes = data.getBytes("UTF-8");
            }

            ContentResolver resolver = getContext().getContentResolver();
            try (OutputStream os = resolver.openOutputStream(file.uri, "wt")) { // "wt" = write-truncate
                if (os == null) {
                    call.reject("Could not open output stream");
                    return;
                }
                os.write(bytes);
                os.flush();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "writeFile failed", e);
            call.reject("Failed to write file: " + e.getMessage());
        } finally {
            openFiles.remove(fileId);
        }
    }

    // ---------------------------------------------------------------
    // writeChunk  –  streaming write (keeps OutputStream open)
    // ---------------------------------------------------------------

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String fileId = call.getString("fileId");
        String data = call.getString("data", "");
        String encoding = call.getString("encoding", "utf8");

        OpenFile file = getOpenFileOrReject(call, fileId);
        if (file == null) return;

        try {
            // Validate/convert payload before opening the stream so a malformed
            // first chunk does not truncate the destination file.
            byte[] bytes;
            if ("hex".equals(encoding)) {
                bytes = hexStringToByteArray(data);
            } else {
                bytes = data.getBytes("UTF-8");
            }

            // Lazy-open the OutputStream on first chunk after payload validation.
            if (file.outputStream == null) {
                ContentResolver resolver = getContext().getContentResolver();
                file.outputStream = resolver.openOutputStream(file.uri, "wt");
                if (file.outputStream == null) {
                    openFiles.remove(fileId);
                    call.reject("Could not open output stream for streaming");
                    return;
                }
            }

            file.outputStream.write(bytes);
            file.outputStream.flush();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "writeChunk failed", e);
            if (file.outputStream != null) {
                try { file.outputStream.close(); } catch (Exception ignored) {}
                file.outputStream = null;
            }
            openFiles.remove(fileId);
            call.reject("Failed to write chunk: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------
    // closeFile  –  close streaming OutputStream and release fileId
    // ---------------------------------------------------------------

    @PluginMethod
    public void closeFile(PluginCall call) {
        String fileId = call.getString("fileId");
        OpenFile file = getOpenFileOrReject(call, fileId);
        if (file == null) return;

        try {
            if (file.outputStream != null) {
                try {
                    file.outputStream.flush();
                } finally {
                    file.outputStream.close();
                    file.outputStream = null;
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "closeFile failed", e);
            call.reject("Failed to close file: " + e.getMessage());
        } finally {
            openFiles.remove(fileId);
        }
    }

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    @Override
    protected void handleOnDestroy() {
        for (Map.Entry<String, OpenFile> entry : openFiles.entrySet()) {
            OpenFile file = entry.getValue();
            if (file.outputStream != null) {
                try {
                    file.outputStream.close();
                } catch (Exception e) {
                    Log.w(TAG, "Failed to close stream on destroy: " + entry.getKey(), e);
                }
            }
        }
        openFiles.clear();
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /**
     * Look up an OpenFile by fileId, rejecting the call if not found.
     */
    private OpenFile getOpenFileOrReject(PluginCall call, String fileId) {
        if (fileId == null) {
            call.reject("fileId is required");
            return null;
        }
        OpenFile file = openFiles.get(fileId);
        if (file == null) {
            call.reject("Unknown fileId: " + fileId);
            return null;
        }
        return file;
    }

    /**
     * Read all bytes from a content:// URI.
     */
    private byte[] readAllBytes(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream is = resolver.openInputStream(uri)) {
            if (is == null) throw new Exception("Could not open input stream for " + uri);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(chunk)) != -1) {
                buffer.write(chunk, 0, bytesRead);
            }
            return buffer.toByteArray();
        }
    }

    /**
     * Query the display name for a document URI via OpenableColumns.
     */
    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver()
                .query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    return cursor.getString(idx);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not query display name", e);
        }
        return uri.getLastPathSegment();
    }

    /**
     * Query the display name for a tree (directory) URI.
     */
    private String queryTreeDisplayName(Uri treeUri) {
        try {
            DocumentFile docFile = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (docFile != null && docFile.getName() != null) {
                return docFile.getName();
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not query tree display name", e);
        }
        return treeUri.getLastPathSegment();
    }

    /**
     * Convert hex string to byte array.
     * Example: "24580000fb" -> [0x24, 0x58, 0x00, 0x00, 0xfb]
     */
    private byte[] hexStringToByteArray(String hexString) {
        int len = hexString.length();
        if ((len & 1) != 0) {
            throw new IllegalArgumentException("Hex string has odd length: " + len);
        }
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            int hi = Character.digit(hexString.charAt(i), 16);
            int lo = Character.digit(hexString.charAt(i + 1), 16);
            if (hi < 0 || lo < 0) {
                throw new IllegalArgumentException(
                        "Invalid hex character at index " + i);
            }
            data[i / 2] = (byte) ((hi << 4) + lo);
        }
        return data;
    }

    /**
     * Convert byte array to hex string.
     * Example: [0x24, 0x58, 0x00, 0x00, 0xfb] -> "24580000fb"
     */
    private String byteArrayToHexString(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xFF & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
