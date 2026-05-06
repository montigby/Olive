import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import personsRouter from "./persons";
import familyUnitsRouter from "./familyUnits";
import membersRouter from "./members";
import invitesRouter from "./invites";
import linkRequestsRouter from "./linkRequests";
import summaryRouter from "./summary";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(personsRouter);
router.use(familyUnitsRouter);
router.use(membersRouter);
router.use(invitesRouter);
router.use(linkRequestsRouter);
router.use(summaryRouter);

export default router;
