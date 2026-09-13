package pro.thesquad.shell;

import android.os.Handler;
import android.os.Looper;
import android.util.JsonReader;
import android.util.JsonToken;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import okhttp3.Authenticator;
import okhttp3.CacheControl;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;

interface BootstrapCancellation {
    void cancel();
}

interface StoreBootstrapChecking {
    BootstrapCancellation check(StoreDestination destination, Consumer<Boolean> completion);
}

final class StoreBootstrapClient implements StoreBootstrapChecking {
    private static final long MAX_RESPONSE_BYTES = 4096;

    private final Call.Factory callFactory;
    private final Executor callbackExecutor;

    StoreBootstrapClient() {
        this(
                createProductionClient(),
                command -> new Handler(Looper.getMainLooper()).post(command));
    }

    StoreBootstrapClient(Call.Factory callFactory, Executor callbackExecutor) {
        this.callFactory = callFactory;
        this.callbackExecutor = callbackExecutor;
    }

    static OkHttpClient createProductionClient() {
        return new OkHttpClient.Builder()
                .cookieJar(CookieJar.NO_COOKIES)
                .authenticator(Authenticator.NONE)
                .proxyAuthenticator(Authenticator.NONE)
                .cache(null)
                .followRedirects(false)
                .followSslRedirects(false)
                .callTimeout(10, TimeUnit.SECONDS)
                .build();
    }

    @Override
    public BootstrapCancellation check(
            StoreDestination destination,
            Consumer<Boolean> completion) {
        Request request = new Request.Builder()
                .url(destination.bootstrapURL())
                .get()
                .cacheControl(new CacheControl.Builder().noCache().noStore().build())
                .build();
        Call call = callFactory.newCall(request);
        Completion completionGate = new Completion(completion);
        call.enqueue(new Callback() {
            @Override
            public void onFailure(Call ignored, IOException exception) {
                completionGate.complete(false);
            }

            @Override
            public void onResponse(Call ignored, Response response) {
                boolean accepted = false;
                try (response) {
                    ResponseBody body = response.body();
                    MediaType contentType = body == null ? null : body.contentType();
                    if (body != null
                            && contentType != null
                            && contentType.type().equalsIgnoreCase("application")
                            && contentType.subtype().equalsIgnoreCase("json")) {
                        byte[] bytes = readBounded(body.source());
                        if (bytes != null) {
                            String json = new String(bytes, StandardCharsets.UTF_8);
                            if (isStrictCompleteObject(json)) {
                                JSONTokener tokener = new JSONTokener(json);
                                Object parsed = tokener.nextValue();
                                if (parsed instanceof JSONObject && tokener.nextClean() == 0) {
                                    JSONObject object = (JSONObject) parsed;
                                    Object distribution = object.opt("distribution");
                                    accepted = distribution instanceof String
                                            && destination.acceptsBootstrap(
                                                    response.code(),
                                                    response.request().url().toString(),
                                                    response.priorResponse() != null,
                                                    (String) distribution);
                                }
                            }
                        }
                    }
                } catch (IOException | JSONException exception) {
                    accepted = false;
                }
                completionGate.complete(accepted);
            }
        });
        return () -> {
            call.cancel();
            completionGate.complete(false);
        };
    }

    private static boolean isStrictCompleteObject(String json) throws IOException {
        try (JsonReader reader = new JsonReader(new StringReader(json))) {
            reader.setLenient(false);
            if (reader.peek() != JsonToken.BEGIN_OBJECT) {
                return false;
            }
            reader.skipValue();
            return reader.peek() == JsonToken.END_DOCUMENT;
        }
    }

    private static byte[] readBounded(BufferedSource source) throws IOException {
        Buffer buffer = new Buffer();
        long total = 0;
        while (true) {
            long allowance = MAX_RESPONSE_BYTES + 1 - total;
            long read = source.read(buffer, Math.min(1024, allowance));
            if (read == -1) {
                return buffer.readByteArray();
            }
            total += read;
            if (total > MAX_RESPONSE_BYTES) {
                return null;
            }
        }
    }

    private final class Completion {
        private final AtomicBoolean completed = new AtomicBoolean();
        private final Consumer<Boolean> completion;

        private Completion(Consumer<Boolean> completion) {
            this.completion = completion;
        }

        private void complete(boolean accepted) {
            if (completed.compareAndSet(false, true)) {
                callbackExecutor.execute(() -> completion.accept(accepted));
            }
        }
    }
}
