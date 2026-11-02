import { useCallback, useEffect, useRef, useState } from "react";
import { MockRequestError } from "@/data/types";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncResult<T> {
  status: AsyncStatus;
  data: T | null;
  error: MockRequestError | Error | null;
  reload: () => void;
}

/**
 * Minimal async loader for the mock repository.
 * Guards against state updates after unmount and ignores stale responses
 * when the dependency key changes (e.g., entity switch, demo reset).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setStatus("loading");
    setError(null);
    fnRef
      .current()
      .then((result) => {
        if (!current || !mounted.current) return;
        setData(result);
        setStatus("success");
      })
      .catch((err: Error) => {
        if (!current || !mounted.current) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { status, data, error, reload };
}
