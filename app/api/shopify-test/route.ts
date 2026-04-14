import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "../../../lib/shopify";

type ShopQuery = {
  shop: {
    name: string;
    myshopifyDomain: string;
  };
};

export async function GET() {
  try {
    console.log("➡️ Calling Shopify Admin API...");

    const data = await shopifyAdminFetch<ShopQuery>(`
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `);

    console.log("✅ Shopify response:", data);

    return NextResponse.json({
      ok: true,
      shop: data.shop,
    });

  } catch (error) {
    console.error("❌ Shopify error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}