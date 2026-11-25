#!/bin/sh
cd "$(dirname "$0")" && node server.js "${1:-4600}"
