import "server-only";
import { unstable_cache } from "next/cache";
import { shopifyAdminFetch } from "./shopify";
import { env } from "./env";

type CommentEvent = {
  __typename: "CommentEvent";
  id: string;
  createdAt: string;
  rawMessage: string;
};
type EventNode = CommentEvent | { __typename: "BasicEvent" };
type CommentsPage = {
  order: {
    hasTimelineComment: boolean;
    events: {
      nodes: EventNode[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

const commentsQuery = `query OrderStaffComments($id: ID!, $cursor: String) {
  order(id: $id) {
    hasTimelineComment
    events(first: 100, after: $cursor, reverse: true, query: "comments:true") {
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on CommentEvent { id createdAt rawMessage }
      }
    }
  }
}`;

async function scanComments(id: string) {
  const comments: { id: string; createdAt: string; message: string }[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: CommentsPage = await shopifyAdminFetch<CommentsPage>(commentsQuery, { id, cursor });
    if (!data.order) return null;
    // comments:true includes automatic events too; only staff CommentEvents belong here.
    for (const event of data.order.events.nodes) {
      if (event.__typename === "CommentEvent") {
        comments.push({ id: event.id, createdAt: event.createdAt, message: event.rawMessage });
      }
    }
    const page = data.order.events.pageInfo;
    if (!data.order.hasTimelineComment || !page.hasNextPage) break;
    if (!page.endCursor || page.endCursor === cursor) {
      throw new Error("Shopify returned an incomplete comments page");
    }
    cursor = page.endCursor;
  }
  return comments.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export const getOrderComments = unstable_cache(
  scanComments,
  ["g3pre-staff-comments-v1", env.shopifyStoreDomain],
  { revalidate: 60 }
);
