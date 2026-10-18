# Production Owner Phone QA Audit Report

Audited live production site: `https://business.chalkboard.shreyaan.work`  
Date: 18 October 2026  
Viewports: 390px (iPhone 12/13/14) and 360px (Android small) in light mode, touch-enabled.

## Walkthrough Screenshots

| Step | View / Interaction | 390px Screenshot | 360px Screenshot |
|---|---|---|---|
| 00 | Landing Page | [00-landing-390.png](file:///docs/qa/prod-owner/00-landing-390.png) | [00-landing-360.png](file:///docs/qa/prod-owner/00-landing-360.png) |
| 01 | Today Tab (greeting, setup, action chips, input dock) | [01-today-390.png](file:///docs/qa/prod-owner/01-today-390.png) | [01-today-360.png](file:///docs/qa/prod-owner/01-today-360.png) |
| 02 | Shop Tab (overview, your page card, menu tile) | [02-shop-overview-390.png](file:///docs/qa/prod-owner/02-shop-overview-390.png) | [02-shop-overview-360.png](file:///docs/qa/prod-owner/02-shop-overview-360.png) |
| 03 | Shop Menu (categories, items, prices, edit actions) | [03-shop-menu-390.png](file:///docs/qa/prod-owner/03-shop-menu-390.png) | [03-shop-menu-360.png](file:///docs/qa/prod-owner/03-shop-menu-360.png) |
| 04 | Shop Rename / Edit Details (name input, step progress chips) | [04-shop-rename-390.png](file:///docs/qa/prod-owner/04-shop-rename-390.png) | [04-shop-rename-360.png](file:///docs/qa/prod-owner/04-shop-rename-360.png) |
| 05 | Grow Tab (prep plan, close day, orders, supply chain) | [05-grow-overview-390.png](file:///docs/qa/prod-owner/05-grow-overview-390.png) | [05-grow-overview-360.png](file:///docs/qa/prod-owner/05-grow-overview-360.png) |
| 06 | Supply Chain Purchase Orders (suppliers, PO list) | [06-supply-orders-390.png](file:///docs/qa/prod-owner/06-supply-orders-390.png) | [06-supply-orders-360.png](file:///docs/qa/prod-owner/06-supply-orders-360.png) |
| 07 | Purchase Order Detail (PO, ORDRSP, ASN, Invoice tracking) | [07-supply-order-detail-390.png](file:///docs/qa/prod-owner/07-supply-order-detail-390.png) | [07-supply-order-detail-360.png](file:///docs/qa/prod-owner/07-supply-order-detail-360.png) |
| 08 | You Tab (profile, trust card, settings, language, look, voice) | [08-you-overview-390.png](file:///docs/qa/prod-owner/08-you-overview-390.png) | [08-you-overview-360.png](file:///docs/qa/prod-owner/08-you-overview-360.png) |
| 09 | Coach Chat (message input, live bubble streaming) | [09-coach-chat-390.png](file:///docs/qa/prod-owner/09-coach-chat-390.png) | [09-coach-chat-360.png](file:///docs/qa/prod-owner/09-coach-chat-360.png) |
| 10 | Coach Photo Attach (classification chips: Shop, Menu, Product, Receipt, Till) | [10-coach-photo-390.png](file:///docs/qa/prod-owner/10-coach-photo-390.png) | [10-coach-photo-360.png](file:///docs/qa/prod-owner/10-coach-photo-360.png) |
| 11 | Close the Day Sheet (POS, deliveries, stock count, manual entry) | [11-close-day-390.png](file:///docs/qa/prod-owner/11-close-day-390.png) | [11-close-day-360.png](file:///docs/qa/prod-owner/11-close-day-360.png) |
| 12 | Face Check Entry Sheet (consent, camera verification) | [12-face-check-390.png](file:///docs/qa/prod-owner/12-face-check-390.png) | [12-face-check-360.png](file:///docs/qa/prod-owner/12-face-check-360.png) |

## Issues Discovered & Filed

1. **#210**: `Supply chain: 'undefined-day credit' rendered when supplier rules omit terms_days`
2. **#211**: `Grow tab: 'Payments & rides' tile displays hardcoded Indian Rupee (₹) icon in Singapore / non-INR markets`
3. **#212**: `Supply chain: PO number wraps awkwardly across multiple lines on phone viewports`
4. **#213**: `Shop edit details: step progress chips horizontally truncated without scroll affordance on mobile`
5. **#214**: `Coach chat: top greeting headline is vertically clipped by sticky top app bar on mobile load`

*(Note: #153 already tracked landing page lacking a guest/demo entry point)*
