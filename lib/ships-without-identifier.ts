// No ships were flight-ready, missing scIdentifier, and also unkeyable by any method.

export interface FleetyardShip {
    id: string;
    scIdentifier?: string | null;
    name: string;
    slug: string;
    productionStatus?: string;
    [key: string]: any;
}

export const skippedFleetyardsShips: FleetyardShip[] = [];
