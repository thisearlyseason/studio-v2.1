package pro.thesquad.shell;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import kotlin.jvm.functions.Function0;
import kotlin.reflect.KClass;
import okhttp3.Authenticator;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.Okio;
import okio.Source;
import okio.Timeout;

@RunWith(AndroidJUnit4.class)
public final class StoreBootstrapClientInstrumentedTest {
    private static final StoreDestination DESTINATION =
            StoreDestination.parse("https://store.example.com");

    @Test
    public void rejectsWebDistribution() throws Exception {
        assertFalse(checkFixture(Fixture.response(
                200, "application/json", "{\"distribution\":\"web\"}")));
    }

    @Test
    public void acceptsStringStoreObject() throws Exception {
        assertTrue(checkFixture(Fixture.response(
                200,
                "application/json; charset=utf-8",
                "{\"distribution\":\"store\"}")));
    }

    @Test
    public void acceptsMixedCaseMediaTypeAndExactly4096Bytes() throws Exception {
        assertTrue(checkFixture(Fixture.response(
                200, "Application/JSON", "{\"distribution\":\"store\"}")));

        String prefix = "{\"distribution\":\"store\"}";
        assertTrue(checkFixture(Fixture.response(
                200,
                "application/json",
                prefix + repeat(' ', 4096 - prefix.length()))));
    }

    @Test
    public void rejectsSameLiteralInvalidResponseCasesAsIos() throws Exception {
        List<Fixture> fixtures = new ArrayList<>();
        fixtures.add(Fixture.response(503, "application/json", "{\"distribution\":\"store\"}"));
        fixtures.add(Fixture.response(200, "application/json", "{\"distribution\":\"unknown\"}"));
        fixtures.add(Fixture.response(200, "application/json", "{}"));
        fixtures.add(Fixture.response(200, "application/json", "{\"distribution\":null}"));
        fixtures.add(Fixture.response(200, "application/json", "{\"distribution\":1}"));
        fixtures.add(Fixture.response(200, "application/json", "[]"));
        fixtures.add(Fixture.response(200, "application/json", "{\"distribution\""));
        fixtures.add(Fixture.response(
                200,
                "application/json",
                "{\"distribution\":\"store\"} trailing"));
        fixtures.add(Fixture.response(200, "text/plain", "{\"distribution\":\"store\"}"));
        fixtures.add(Fixture.response(200, "application/json", repeat(' ', 4097)));

        for (Fixture fixture : fixtures) {
            assertFalse(checkFixture(fixture));
        }
    }

    @Test
    public void rejectsLenientJSONObjectSyntax() throws Exception {
        String[] malformedBodies = {
                "{distribution:'store'}",
                "{'distribution':'store'}",
                "{distribution:\"store\"}",
                "{\"distribution\"=\"store\"}",
                "{\"distribution\":/*comment*/\"store\"}"
        };

        for (String body : malformedBodies) {
            assertFalse(body, checkFixture(Fixture.response(200, "application/json", body)));
        }
    }

    @Test
    public void rejectsMissingMediaTypeRedirectAndWrongFinalUrl() throws Exception {
        assertFalse(checkFixture(Fixture.response(
                200, null, "{\"distribution\":\"store\"}")));

        Fixture redirected = Fixture.response(
                200, "application/json", "{\"distribution\":\"store\"}");
        redirected.redirected = true;
        assertFalse(checkFixture(redirected));

        Fixture wrongFinalUrl = Fixture.response(
                200, "application/json", "{\"distribution\":\"store\"}");
        wrongFinalUrl.finalUrl = "https://store.example.com/login";
        assertFalse(checkFixture(wrongFinalUrl));
    }

    @Test
    public void rejectsTransportAndTimeoutFailures() throws Exception {
        assertFalse(checkFixture(Fixture.failure(new IOException("offline"))));
        assertFalse(checkFixture(Fixture.failure(new SocketTimeoutException("timeout"))));
    }

    @Test
    public void requestIsExactNonCredentialedUncachedGet() throws Exception {
        ControlledCallFactory calls = new ControlledCallFactory(Fixture.response(
                200, "application/json", "{\"distribution\":\"store\"}"));
        assertTrue(check(calls));

        Request request = calls.lastCall.request();
        assertEquals(
                "https://store.example.com/api/app-distribution",
                request.url().toString());
        assertEquals("GET", request.method());
        assertNull(request.header("Cookie"));
        assertNull(request.header("Authorization"));
        assertTrue(request.cacheControl().noCache());
        assertTrue(request.cacheControl().noStore());
        assertEquals(1, calls.created.get());
    }

    @Test
    public void productionClientIsPrivateNonRedirectingAndTenSecondBounded() {
        OkHttpClient first = StoreBootstrapClient.createProductionClient();
        OkHttpClient second = StoreBootstrapClient.createProductionClient();

        assertTrue(first != second);
        assertSame(CookieJar.NO_COOKIES, first.cookieJar());
        assertSame(Authenticator.NONE, first.authenticator());
        assertSame(Authenticator.NONE, first.proxyAuthenticator());
        assertNull(first.cache());
        assertFalse(first.followRedirects());
        assertFalse(first.followSslRedirects());
        assertEquals(10_000, first.callTimeoutMillis());
    }

    @Test
    public void rejectsOversizeStreamingBodyAndClosesIt() throws Exception {
        String prefix = "{\"distribution\":\"store\"}";
        Fixture fixture = Fixture.chunkedResponse(
                200,
                "application/json",
                prefix,
                repeat(' ', 4090),
                repeat(' ', 7));
        ControlledCallFactory calls = new ControlledCallFactory(fixture);

        assertFalse(check(calls));
        assertTrue(calls.lastCall.bodyClosed.get());
    }

    @Test
    public void closesAcceptedResponseBody() throws Exception {
        ControlledCallFactory calls = new ControlledCallFactory(Fixture.response(
                200, "application/json", "{\"distribution\":\"store\"}"));

        assertTrue(check(calls));
        assertTrue(calls.lastCall.bodyClosed.get());
    }

    @Test
    public void cancellationCompletesFalseExactlyOnce() {
        ControlledCallFactory calls = new ControlledCallFactory(Fixture.pending());
        StoreBootstrapClient client = new StoreBootstrapClient(calls, Runnable::run);
        AtomicInteger completions = new AtomicInteger();
        AtomicReference<Boolean> result = new AtomicReference<>();
        BootstrapCancellation cancellation = client.check(DESTINATION, accepted -> {
            completions.incrementAndGet();
            result.set(accepted);
        });

        cancellation.cancel();
        calls.lastCall.failAfterCancellation();

        assertTrue(calls.lastCall.isCanceled());
        assertEquals(1, completions.get());
        assertEquals(Boolean.FALSE, result.get());
    }

    @Test
    public void misbehavingCallCannotCompleteTwice() {
        Fixture fixture = Fixture.response(
                200, "application/json", "{\"distribution\":\"store\"}");
        fixture.failureAfterResponse = true;
        ControlledCallFactory calls = new ControlledCallFactory(fixture);
        AtomicInteger completions = new AtomicInteger();
        AtomicReference<Boolean> result = new AtomicReference<>();
        StoreBootstrapClient client = new StoreBootstrapClient(calls, Runnable::run);

        client.check(DESTINATION, accepted -> {
            completions.incrementAndGet();
            result.set(accepted);
        });

        assertEquals(1, completions.get());
        assertEquals(Boolean.TRUE, result.get());
    }

    private boolean checkFixture(Fixture fixture) throws Exception {
        return check(new ControlledCallFactory(fixture));
    }

    private boolean check(ControlledCallFactory calls) throws Exception {
        StoreBootstrapClient client = new StoreBootstrapClient(calls, Runnable::run);
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Boolean> result = new AtomicReference<>();
        client.check(DESTINATION, accepted -> {
            result.set(accepted);
            completed.countDown();
        });
        assertTrue("bootstrap completion timed out", completed.await(2, TimeUnit.SECONDS));
        return Boolean.TRUE.equals(result.get());
    }

    private static String repeat(char character, int count) {
        StringBuilder value = new StringBuilder(count);
        for (int index = 0; index < count; index += 1) {
            value.append(character);
        }
        return value.toString();
    }

    private static final class Fixture {
        private int status;
        private String contentType;
        private byte[][] chunks;
        private IOException failure;
        private boolean pending;
        private boolean redirected;
        private boolean failureAfterResponse;
        private String finalUrl = DESTINATION.bootstrapURL();

        private static Fixture response(int status, String contentType, String body) {
            return chunkedResponse(status, contentType, body);
        }

        private static Fixture chunkedResponse(
                int status,
                String contentType,
                String... chunks) {
            Fixture fixture = new Fixture();
            fixture.status = status;
            fixture.contentType = contentType;
            fixture.chunks = new byte[chunks.length][];
            for (int index = 0; index < chunks.length; index += 1) {
                fixture.chunks[index] = chunks[index].getBytes(StandardCharsets.UTF_8);
            }
            return fixture;
        }

        private static Fixture failure(IOException failure) {
            Fixture fixture = new Fixture();
            fixture.failure = failure;
            return fixture;
        }

        private static Fixture pending() {
            Fixture fixture = new Fixture();
            fixture.pending = true;
            return fixture;
        }
    }

    private static final class ControlledCallFactory implements Call.Factory {
        private final Fixture fixture;
        private final AtomicInteger created = new AtomicInteger();
        private ControlledCall lastCall;

        private ControlledCallFactory(Fixture fixture) {
            this.fixture = fixture;
        }

        @Override
        public Call newCall(Request request) {
            created.incrementAndGet();
            lastCall = new ControlledCall(request, fixture);
            return lastCall;
        }
    }

    private static final class ControlledCall implements Call {
        private final Request request;
        private final Fixture fixture;
        private final AtomicBoolean bodyClosed = new AtomicBoolean();
        private boolean executed;
        private boolean cancelled;
        private Callback callback;

        private ControlledCall(Request request, Fixture fixture) {
            this.request = request;
            this.fixture = fixture;
        }

        @Override
        public Request request() {
            return request;
        }

        @Override
        public Response execute() {
            throw new UnsupportedOperationException("Tests exercise the asynchronous client.");
        }

        @Override
        public void enqueue(Callback callback) {
            executed = true;
            this.callback = callback;
            if (fixture.pending) {
                return;
            }
            if (fixture.failure != null) {
                callback.onFailure(this, fixture.failure);
                return;
            }
            try {
                callback.onResponse(this, response());
            } catch (IOException exception) {
                callback.onFailure(this, exception);
            }
            if (fixture.failureAfterResponse) {
                callback.onFailure(this, new IOException("late failure"));
            }
        }

        private Response response() {
            Request finalRequest = request.newBuilder().url(fixture.finalUrl).build();
            MediaType mediaType = fixture.contentType == null
                    ? null
                    : MediaType.parse(fixture.contentType);
            BufferedSource source = Okio.buffer(new ChunkedSource(fixture.chunks, bodyClosed));
            ResponseBody body = new ResponseBody() {
                @Override
                public MediaType contentType() {
                    return mediaType;
                }

                @Override
                public long contentLength() {
                    return -1;
                }

                @Override
                public BufferedSource source() {
                    return source;
                }
            };
            Response.Builder response = new Response.Builder()
                    .request(finalRequest)
                    .protocol(Protocol.HTTP_1_1)
                    .code(fixture.status)
                    .message("fixture")
                    .body(body);
            if (fixture.redirected) {
                response.priorResponse(new Response.Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(302)
                        .message("redirect")
                        .build());
            }
            return response.build();
        }

        private void failAfterCancellation() {
            callback.onFailure(this, new IOException("cancelled"));
        }

        @Override
        public void cancel() {
            cancelled = true;
        }

        @Override
        public boolean isExecuted() {
            return executed;
        }

        @Override
        public boolean isCanceled() {
            return cancelled;
        }

        @Override
        public Timeout timeout() {
            return Timeout.NONE;
        }

        @Override
        public <T> T tag(KClass<T> type) {
            return null;
        }

        @Override
        public <T> T tag(Class<? extends T> type) {
            return null;
        }

        @Override
        public <T> T tag(KClass<T> type, Function0<? extends T> compute) {
            return compute.invoke();
        }

        @Override
        public <T> T tag(Class<T> type, Function0<? extends T> compute) {
            return compute.invoke();
        }

        @Override
        public Call clone() {
            return new ControlledCall(request, fixture);
        }
    }

    private static final class ChunkedSource implements Source {
        private final byte[][] chunks;
        private final AtomicBoolean closed;
        private int chunkIndex;
        private int chunkOffset;

        private ChunkedSource(byte[][] chunks, AtomicBoolean closed) {
            this.chunks = chunks;
            this.closed = closed;
        }

        @Override
        public long read(Buffer sink, long byteCount) {
            while (chunkIndex < chunks.length) {
                byte[] chunk = chunks[chunkIndex];
                int remaining = chunk.length - chunkOffset;
                if (remaining == 0) {
                    chunkIndex += 1;
                    chunkOffset = 0;
                    continue;
                }
                int count = (int) Math.min(byteCount, remaining);
                sink.write(chunk, chunkOffset, count);
                chunkOffset += count;
                return count;
            }
            return -1;
        }

        @Override
        public Timeout timeout() {
            return Timeout.NONE;
        }

        @Override
        public void close() {
            closed.set(true);
        }
    }
}
