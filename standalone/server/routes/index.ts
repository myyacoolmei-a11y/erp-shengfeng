import { Router, type IRouter } from "express";
import healthRouter from "./health";
import linePublicRouter from "./linePublic";
import quoteSharePublicRouter from "./quoteSharePublic";
import subsidyPublicRouter from "./subsidyPublic";
import authRouter from "./auth";
import usersRouter from "./users";
import customersRouter from "./customers";
import customerAddressesRouter from "./customerAddresses";
import acUnitsRouter from "./acUnits";
import employeesRouter from "./employees";
import quotesRouter from "./quotes";
import workOrdersRouter from "./workOrders";
import repairCasesRouter from "./repairCases";
import paymentsRouter from "./payments";
import warrantiesRouter from "./warranties";
import maintenanceRouter from "./maintenance";
import receivablesRouter from "./receivables";
import dashboardRouter from "./dashboard";
import productsRouter from "./products";
import wholesaleProductsRouter from "./wholesale-products";
import wholesaleCustomersRouter from "./wholesale-customers";
import wholesaleQuotesRouter from "./wholesale-quotes";
import wholesaleOrdersRouter from "./wholesale-orders";
import wholesaleReceivablesRouter from "./wholesale-receivables";
import wholesaleSettlementsRouter from "./wholesale-settlements";
import voiceRouter from "./voice";
import reminderSettingsRouter from "./reminderSettings";
import workOrderFieldProgressRouter from "./workOrderFieldProgress";
import jobsRouter from "./jobs";
import partnerRouter from "./partner";
import notificationsRouter from "./notifications";
import aiWorkReminderSettingsRouter from "./aiWorkReminderSettings";
import pushRouter from "./push";
import inventoryRouter from "./inventory";
import adminWorkbenchRouter from "./adminWorkbench";
import subsidyCaseFilesRouter, { subsidyCaseFilesTokenRouter } from "./subsidyCaseFiles";

import { authenticate } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(linePublicRouter);
router.use(quoteSharePublicRouter);
router.use(subsidyPublicRouter);
router.use(authRouter);
router.use(jobsRouter);
// 短效簽章的附件／ZIP 連結（<img>、<a download> 無法帶 header）；
// 未帶 token 時會往下走一般登入驗證。
router.use(subsidyCaseFilesTokenRouter);

router.use(authenticate);

// IMPORTANT: feature/role gates inside each router MUST be path-scoped
// (e.g. router.use("/customers", requireFeature(...))).
// Bare router.use(requireFeature(...)) runs for every request that enters
// the mounted router and will 403 sibling APIs (e.g. engineers blocked by customers).

router.use(usersRouter);
router.use(customersRouter);
router.use(customerAddressesRouter);
router.use(acUnitsRouter);
router.use(employeesRouter);
router.use(quotesRouter);
router.use(workOrdersRouter);
router.use(repairCasesRouter);
router.use(paymentsRouter);
router.use(warrantiesRouter);
router.use(maintenanceRouter);
router.use(receivablesRouter);
router.use(dashboardRouter);
router.use(productsRouter);
router.use(wholesaleProductsRouter);
router.use(wholesaleCustomersRouter);
router.use(wholesaleQuotesRouter);
router.use(wholesaleOrdersRouter);
router.use(wholesaleReceivablesRouter);
router.use(wholesaleSettlementsRouter);
router.use(voiceRouter);
router.use(reminderSettingsRouter);
router.use(aiWorkReminderSettingsRouter);
router.use(partnerRouter);
router.use(notificationsRouter);
router.use(pushRouter);
router.use(workOrderFieldProgressRouter);
router.use(adminWorkbenchRouter);
router.use(subsidyCaseFilesRouter);
router.use(inventoryRouter);

export default router;
