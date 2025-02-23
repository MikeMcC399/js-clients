import type { AnyClient } from "@gadgetinc/api-client-core";
import { Provider as GadgetUrqlProvider, useQuery } from "@gadgetinc/react";
import type { ReactNode } from "react";
import React, { useEffect, useMemo } from "react";
import { GadgetBigCommerceContext } from "./index.js";

type ProviderLocation = {
  query?: URLSearchParams;
};

const BigCommerceSessionQuery = `
  query BigCommerceSession {
    currentSession {
      bigCommerceUserId
      bigCommerceStore {
        storeHash
      }
      roles {
        key
      }
    }
  }
`;

const InnerProvider = (props: { children: ReactNode; api: AnyClient; signedPayload: string | undefined }) => {
  const { api, signedPayload } = props;

  const [{ data, fetching, error }] = useQuery<{
    currentSession: { bigCommerceUserId: string; bigCommerceStore: { storeHash: string }; roles: { key: string }[] };
  }>({
    query: BigCommerceSessionQuery,
  });

  useEffect(() => {
    if (!signedPayload) {
      console.log("[gadget-react-big-commerce] no signed payload, skipping auth setup");
      return;
    }

    api.connection.setAuthenticationMode({
      custom: {
        async processFetch(_input, init) {
          const headers = new Headers(init.headers);
          headers.append("Authorization", `BigCommerceSignedPayload ${signedPayload}`);
          init.headers ??= {};
          headers.forEach(function (value, key) {
            (init.headers as Record<string, string>)[key] = value;
          });
        },
        async processTransactionConnectionParams(params) {
          params.auth.bigCommerceSignedPayload = signedPayload;
        },
      },
    });
  }, [api, signedPayload]);

  const isAuthenticated = !!data?.currentSession?.roles?.some((role) => role.key === "Role-BigCommerce-App");
  const userId = data?.currentSession?.bigCommerceUserId ?? undefined;
  const storeHash = data?.currentSession?.bigCommerceStore?.storeHash ?? undefined;

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const BigCommerce = (window as any).Bigcommerce;

    if (!BigCommerce) {
      console.warn("[gadget-react-big-commerce] BigCommerce global not found, not initializing BigCommerce SDK");
      return;
    }

    console.debug("[gadget-react-big-commerce] initializing BigCommerce SDK");
    BigCommerce.init();
  }, [isAuthenticated]);

  console.debug("[gadget-react-big-commerce] provider rendering", {
    signedPayload,
    data,
    fetching,
    error,
    isAuthenticated,
    userId,
    storeHash,
  });

  return (
    <GadgetBigCommerceContext.Provider
      value={{
        loading: fetching,
        error,
        isAuthenticated,
        userId,
        storeHash,
      }}
    >
      {props.children}
    </GadgetBigCommerceContext.Provider>
  );
};

export const Provider = ({ children, api }: { children: ReactNode; api: AnyClient }) => {
  const location = useMemo<ProviderLocation>(() => {
    return {
      query: new URLSearchParams(window.location.search),
    };
  }, []);

  const { query } = location ?? {};
  const signed_payload = query?.get("signed_payload") ?? undefined;

  return (
    <GadgetUrqlProvider api={api}>
      <InnerProvider api={api} signedPayload={signed_payload}>
        {children}
      </InnerProvider>
    </GadgetUrqlProvider>
  );
};
