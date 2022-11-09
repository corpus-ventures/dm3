import { Axios } from 'axios';
import 'dotenv/config';
import express from 'express';
import { handleSubmitMessage } from './methods/handleSubmitMessage';

const DM3_SUBMIT_MESSAGE = 'dm3_submitMessage';
const DM3_GET_DELIVERY_SERVICE_PROPERTIES = 'dm3_getDeliveryServiceProperties';

export default (axios: Axios) => {
    const router = express.Router();

    router.post('/', async (req, res, next) => {
        //RPC must be called with a method name
        if (req.body?.method === undefined) {
            return res.send(400);
        }

        const { method } = req.body;

        switch (method) {
            case DM3_SUBMIT_MESSAGE:
                return handleSubmitMessage(req, res, next);

            case DM3_GET_DELIVERY_SERVICE_PROPERTIES:
                return;
        }

        if (method) return forwardToRpcNode(axios)(req, res, next);
    });
    return router;
};

const forwardToRpcNode =
    (axios: Axios) =>
    async (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) => {
        try {
            const data = (await axios.post(process.env.RPC as string, req.body))
                .data;
            console.log('data ' + data);
            res.json(data);
        } catch (e) {
            next(e);
        }
    };
