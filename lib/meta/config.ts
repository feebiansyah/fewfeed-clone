export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "ads_management",
  "ads_read",
  "business_management",
] as const;

export type MetaConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
};

function required(name: "META_APP_ID" | "META_APP_SECRET" | "META_REDIRECT_URI"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`MISSING_${name}`);
  }
  return value;
}

export function getMetaConfig(): MetaConfig {
  const graphVersion = process.env.META_GRAPH_VERSION
    ?? (process.env.NODE_ENV !== "production" ? "v25.0" : undefined);
  if (!graphVersion) {
    throw new Error("MISSING_META_GRAPH_VERSION");
  }

  return {
    appId: required("META_APP_ID"),
    appSecret: required("META_APP_SECRET"),
    redirectUri: required("META_REDIRECT_URI"),
    graphVersion,
  };
}
