#!/usr/bin/env bash
# Pára o sidecar (:3739) e o serve.py (:8099). SIGTERM → o sidecar apaga token/pid ao sair (shutdown limpo).
for p in 3739 8099; do
  pids=$(ss -ltnpH "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
  if [ -n "$pids" ]; then kill $pids && echo "  [x] :$p (pid $pids)"; else echo "  [=] :$p livre"; fi
done
