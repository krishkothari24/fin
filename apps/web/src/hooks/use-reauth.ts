import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/providers/toast-provider";

/** Opens Plaid Link in update mode to resolve one item's `login_required` status. */
export function useReauth() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [itemId, setItemId] = useState<string | null>(null);
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const onSuccess = useCallback(() => {
    showToast("Reconnected — syncing the latest data.");
    setReauthToken(null);
    setItemId(null);
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }, [queryClient, showToast]);

  const onExit = useCallback(() => {
    setReauthToken(null);
    setItemId(null);
  }, []);

  const { open, ready } = usePlaidLink({ token: reauthToken ?? "", onSuccess, onExit });

  useEffect(() => {
    if (reauthToken && ready) open();
  }, [reauthToken, ready, open]);

  const reauth = useCallback(async (id: string) => {
    setPreparing(true);
    setItemId(id);
    try {
      const { linkToken } = await api.post<{ linkToken: string; expiration: string }>(
        `/items/${id}/reauth-token`,
      );
      setReauthToken(linkToken);
    } finally {
      setPreparing(false);
    }
  }, []);

  return {
    reauth,
    preparingItemId: preparing ? itemId : null,
    activeItemId: reauthToken ? itemId : null,
  };
}
