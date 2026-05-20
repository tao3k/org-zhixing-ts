set dotenv-load := false

default:
    @just --list

install:
    npm install

dev port="5173":
    npm run dev -- --port {{port}}

typecheck:
    npm run typecheck

harness:
    npm run harness

harness-json:
    npm run harness:json

harness-agent-snapshot:
    npm run harness:agent-snapshot

static:
    npm run generate:static

test:
    npm test

build:
    npm run build

check:
    npm run ci

perf repeat="1" iterations="20":
    npm run perf -- --repeat={{repeat}} --iterations={{iterations}}

preview port="4173":
    npm run preview -- --port {{port}}

smoke port="5173":
    curl -fsS http://127.0.0.1:{{port}}/ >/dev/null

clean:
    rm -rf dist tsconfig.tsbuildinfo
