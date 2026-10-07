#!/bin/sh
set -e

envsubst < /etc/livekit.yaml.template > /tmp/livekit.yaml

exec /livekit-server --config /tmp/livekit.yaml
