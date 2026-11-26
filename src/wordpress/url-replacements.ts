export type Replacement = readonly [from: string, to: string];

const SCHEMES = ['https', 'http'] as const;
const SUBDOMAINS = ['www.', ''] as const;

export function buildUrlReplacements(productionUrls: string[], localUrl: string): Replacement[] {
  const localHost = new URL(localUrl).host;
  const productionHosts = new Set(productionUrls.map((url) => new URL(url).host.replace(/^www\./, '')));

  const replacements = [...productionHosts].flatMap((host) => [
    ...absoluteUrlReplacements(host, localUrl),
    ...SUBDOMAINS.map((subdomain): Replacement => [`//${subdomain}${host}`, `//${localHost}`]),
  ]);

  return replacements.filter(([from, to]) => from !== to);
}

function absoluteUrlReplacements(host: string, localUrl: string): Replacement[] {
  return SCHEMES.flatMap((scheme) =>
    SUBDOMAINS.flatMap((subdomain) => {
      const productionUrl = `${scheme}://${subdomain}${host}`;
      return [
        [productionUrl, localUrl],
        [escapeSlashes(productionUrl), escapeSlashes(localUrl)],
      ] satisfies Replacement[];
    }),
  );
}

function escapeSlashes(url: string): string {
  return url.replace(/\//g, '\\/');
}
