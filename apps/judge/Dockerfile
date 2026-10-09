# VibeJudge judge worker image
# Build (repo root থেকে):  docker build -f apps/judge/Dockerfile -t vibejudge-judge .
# Run:                     docker run --rm --privileged --cgroupns=private vibejudge-judge

# ---------- 1. isolate sandbox build ----------
FROM debian:trixie-slim AS isolate
ARG ISOLATE_VERSION=v2.7
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates git libcap-dev libseccomp-dev \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${ISOLATE_VERSION} https://github.com/ioi/isolate.git /src/isolate
WORKDIR /src/isolate
RUN make isolate

# ---------- 2. testlib.h (special judge checker-এর জন্য) ----------
FROM debian:trixie-slim AS testlib
ARG TESTLIB_COMMIT=1e4e8a24c79c6bad3becbdb5a332ffc352b7d5dd
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /testlib.h https://raw.githubusercontent.com/MikeMirzayanov/testlib/${TESTLIB_COMMIT}/testlib.h

# ---------- 3. TypeScript build ----------
FROM node:22-trixie-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/judge/package.json apps/judge/
RUN pnpm install --frozen-lockfile --filter @vibejudge/judge...
COPY packages/shared packages/shared
COPY apps/judge apps/judge
RUN pnpm --filter @vibejudge/judge... build

# ---------- 4. runtime ----------
FROM node:22-trixie-slim
# man1 ফোল্ডার না থাকলে slim image-এ openjdk-র ইনস্টল ভেঙে যায়
RUN mkdir -p /usr/share/man/man1 \
 && apt-get update \
 && apt-get install -y --no-install-recommends gcc g++ libc6-dev libcap2 libseccomp2 \
      python3 openjdk-21-jdk-headless \
 && rm -rf /var/lib/apt/lists/* \
 # sandbox-এ /etc থাকে না, তাই /usr/bin/java (→ /etc/alternatives) কাজ করে না — /usr-এর ভেতরে স্থির path
 && ln -s "$(dirname "$(dirname "$(readlink -f /usr/bin/javac)")")" /usr/lib/jvm/vj-java

COPY --from=isolate /src/isolate/isolate /usr/local/bin/isolate
COPY apps/judge/docker/isolate.cf /usr/local/etc/isolate
COPY --from=testlib /testlib.h /opt/testlib/testlib.h
COPY apps/judge/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh && sed -i 's/\r$//' /usr/local/bin/entrypoint.sh

WORKDIR /app
COPY --from=build /app/packages/shared/package.json node_modules/@vibejudge/shared/package.json
COPY --from=build /app/packages/shared/dist node_modules/@vibejudge/shared/dist
COPY --from=build /app/apps/judge/package.json package.json
COPY --from=build /app/apps/judge/dist dist

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]
