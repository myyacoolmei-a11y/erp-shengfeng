import { Router, type IRouter } from "express";
import healthRouter from "./health";
import customersRouter from "./customers";
import acUnitsRouter from "./acUnits";
import quotesRouter from "./quotes";
import workOrdersRouter from "./workOrders";
import paymentsRouter from "./payments";
import warrantiesRouter from "./warranties";
import maintenanceRouter from "./maintenance";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customersRouter);
router.use(acUnitsRouter);
router.use(quotesRouter);
router.use(workOrdersRouter);
router.use(paymentsRouter);
router.use(warrantiesRouter);
router.use(maintenanceRouter);
router.use(dashboardRouter);

export default router;
