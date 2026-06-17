export class BaseNode {
    constructor(id, type, config = {}, position = null) {
        this.id = id;
        this.type = type;
        this.config = config;
        this.position = position;
    }

    validate() {
        return true;
    }

    async execute(context) {
        throw new Error("Execute method not implemented");
    }
}
