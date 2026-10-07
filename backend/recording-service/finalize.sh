#!/bin/sh
set -eu
# Jibri supplies the session directory after closing ffmpeg and Chrome.
# The worker discovers this durable marker even after a restart.
touch "$1/.finished"
