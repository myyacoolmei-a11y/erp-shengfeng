import { Router, type IRouter } from "express";
import healthRouter from "./health";
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
import { authenticate } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(authenticate);

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

export default router;
