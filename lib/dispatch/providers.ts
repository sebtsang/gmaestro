/**
 * Maps each approval artifact type to the Composio actions that can fulfill it,
 * one per provider toolkit. Drives both:
 *  - the approval card's provider picker UI (which providers does the founder
 *    have a choice between for THIS artifact?)
 *  - the post-approval dispatcher (which Composio action do we call when the
 *    founder picks "github"?)
 *
 * For BlogDraft approvals, the founder picks N targets via the channels
 * checkbox — one approval, fans out to N publishes. For ChannelVariant
 * approvals (per-channel previews), there's exactly one provider per variant
 * (the channel is baked in).
 *
 * Adding a new provider for an artifact type = one entry here. No persona
 * changes, no LLM-side scope changes.
 */

export interface ProviderAction {
  /** Toolkit slug as it appears in the local `connections` table. */
  toolkit: string;
  /** Composio action slug to call via `composio.tools.execute(action, ...)`. */
  action: string;
  /** Human label shown on the approval card's provider picker. */
  label: string;
  /**
   * Build the Composio action arguments from the approval's `proposed_action`.
   * The approval row carries the persona's full typed output (formatter's
   * ChannelVariant, etc.) plus optional card metadata — this fn pulls out
   * just the fields the action needs.
   */
  buildArgs: (proposed: Record<string, unknown>) => Record<string, unknown>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Per-artifact provider catalog. Order = preference (first connected provider
 * is auto-selected if only one match).
 */
export const PROVIDERS_BY_ARTIFACT: Record<string, ProviderAction[]> = {
  /**
   * BlogDraft approvals carry `targets: ToolkitId[]` set by the founder via
   * the channels picker. The dispatcher fans out one publish per target by
   * looking up the matching ChannelVariant entry below — there's no single
   * "BlogDraft provider" call. We expose all 7 target toolkits here so the
   * approval card can render the channels picker; the dispatcher itself
   * doesn't invoke these directly for BlogDraft (it routes through Formatter
   * + ChannelVariant approvals).
   */
  BlogDraft: [],

  /**
   * ChannelVariant — one provider per target. The dispatcher reads the
   * variant's `target` field to pick the right provider.
   *
   * For each: `metadata` is the per-channel structure the Formatter persona
   * produced; the buildArgs fn extracts the Composio-action-specific args.
   */
  ChannelVariant: [
    {
      toolkit: "github",
      action: "GITHUB_CREATE_PULL_REQUEST",
      label: "GitHub PR",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        // GitHub publish is a 2-step flow (commit file then open PR).
        // The dispatcher recognizes target=github and runs both
        // `GITHUB_COMMIT_MULTIPLE_FILES` then `GITHUB_CREATE_PULL_REQUEST`.
        // We only need the args for the PR step here — commit args are
        // derived from the variant's `content` (markdown body) and metadata.path.
        const repo = asString(metadata.repo) ?? "anvil-co/anvil-site";
        const [owner, repoName] = repo.split("/");
        return {
          owner,
          repo: repoName,
          title: asString(metadata.prTitle) ?? "Add post",
          head: asString(metadata.branch) ?? "content/new-post",
          base: "main",
          body: asString(metadata.prBody) ?? asString(p.content) ?? "",
          // The actual file commit happens in the dispatcher pre-step using
          // GITHUB_COMMIT_MULTIPLE_FILES with: { owner, repo, branch, path,
          // content: variant.content }.
          _commitFile: {
            path: asString(metadata.path) ?? "content/blog/post.mdx",
            content: asString(p.content) ?? "",
          },
        };
      },
    },
    {
      toolkit: "wordpress",
      action: "WORDPRESS_CREATE_POST", // TBD — verify slug via _probe-mcp-tools.ts
      label: "WordPress",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        return {
          title: asString(metadata.title) ?? "",
          content: asString(p.content) ?? "",
          slug: asString(metadata.slug) ?? "",
          excerpt: asString(metadata.excerpt) ?? "",
          status: asString(metadata.status) ?? "draft",
          categories: Array.isArray(metadata.categories) ? metadata.categories : [],
          tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        };
      },
    },
    {
      toolkit: "ghost",
      action: "GHOST_CREATE_POST", // TBD — verify slug via _probe-mcp-tools.ts
      label: "Ghost",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        return {
          title: asString(metadata.title) ?? "",
          html: asString(p.content) ?? "",
          slug: asString(metadata.slug) ?? "",
          excerpt: asString(metadata.excerpt) ?? "",
          status: asString(metadata.status) ?? "draft",
          tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        };
      },
    },
    {
      toolkit: "notion",
      action: "NOTION_INSERT_ROW_DATABASE",
      label: "Notion",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        // Variant content is a JSON-stringified array of Notion block objects.
        // Notion's row-insert action takes properties + children blocks.
        let children: unknown[] = [];
        try {
          children = JSON.parse(asString(p.content) ?? "[]");
        } catch {
          children = [];
        }
        return {
          database_id: asString(metadata.databaseId) ?? "",
          properties: metadata.properties ?? {},
          children,
        };
      },
    },
    {
      toolkit: "reddit",
      action: "REDDIT_CREATE_REDDIT_POST",
      label: "Reddit",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        return {
          subreddit: asString(metadata.subreddit) ?? "test",
          kind: asString(metadata.kind) ?? "self",
          title: asString(metadata.title) ?? "",
          text: asString(p.content) ?? "",
          ...(metadata.flair ? { flair_text: asString(metadata.flair) } : {}),
        };
      },
    },
    {
      toolkit: "linkedin",
      action: "LINKEDIN_CREATE_LINKED_IN_POST",
      label: "LinkedIn",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        return {
          commentary: asString(p.content) ?? "",
          visibility: asString(metadata.visibility) ?? "PUBLIC",
        };
      },
    },
    {
      toolkit: "twitter",
      action: "TWITTER_CREATION_OF_A_POST",
      label: "X (Twitter)",
      buildArgs: (p) => {
        const metadata = asObject(p.metadata);
        // For threads, the content is newline-`---`-separated tweets.
        // The dispatcher chains them via reply_in_reply_to_tweet_id.
        const isThread = asString(metadata.kind) === "thread";
        const content = asString(p.content) ?? "";
        if (isThread) {
          const tweets = content
            .split(/\n---\n/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          return {
            text: tweets[0] ?? "",
            _threadRest: tweets.slice(1),
          };
        }
        return { text: content };
      },
    },
  ],

  /**
   * Lower-priority artifacts — TopicResearchBrief / ContentOutline approvals
   * are typically resolved without a Composio call (they're internal gates).
   * Empty provider list = no provider picker, just approve/reject.
   */
  TopicResearchBrief: [],
  ContentOutline: [],
  PublishedArtifact: [],
};

export function getProvidersForArtifact(
  artifactType: string,
): ProviderAction[] {
  return PROVIDERS_BY_ARTIFACT[artifactType] ?? [];
}

export function findProvider(
  artifactType: string,
  toolkit: string,
): ProviderAction | null {
  const candidates = getProvidersForArtifact(artifactType);
  return candidates.find((c) => c.toolkit === toolkit) ?? null;
}
