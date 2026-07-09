import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";

/** Opens Plaid Link to connect a brand-new institution, then exchanges the public token. */
export function usePlaidConnect() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setConnecting(true);
      try {
        await api.post("/plaid/exchange", { publicToken });
        showToast("Account connected — syncing your data.");
        await queryClient.invalidateQueries({ queryKey: ["items"] });
        await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      } finally {
        setConnecting(false);
        setLinkToken(null);
      }
    },
    [queryClient, showToast],
  );

  const onExit = useCallback(() => setLinkToken(null), []);

  const { open, ready } = usePlaidLink({ token: linkToken ?? "", onSuccess, onExit });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const connect = useCallback(async () => {
    setStarting(true);
    try {
      const { linkToken: token } = await api.post<{ linkToken: string; expiration: string }>(
        "/plaid/link-token",
      );
      setLinkToken(token);
    } finally {
      setStarting(false);
    }
  }, []);

  return { connect, starting, connecting };
}
