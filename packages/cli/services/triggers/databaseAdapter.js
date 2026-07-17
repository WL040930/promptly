const databaseAdapter = {
    async reconcile({ subscription }) {
        if (!subscription.state?.initializedAt) {
            await subscription.update({ state: { initializedAt: new Date().toISOString() } });
        }
    },
    async remove() {}
};

export default databaseAdapter;
