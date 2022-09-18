import { Injectable } from '@angular/core';
/* @ts-ignore */
import * as a from "../cpp/gr";

@Injectable({
    providedIn: 'root'
})
export class WasmService {
    module: any | null = null;

    constructor() {
    }

    public getModule() {
        return new Promise((res, rej) => {
            if (this.module !== null) {
                res(this.module);
            } else {
                a.default({
                    locateFile(s: string) {
                        return `./cpp/${s}`;
                    }
                }).then((v: any) => {
                    this.module = v;
                    (window as any).module = v;
                    res(v);
                });
            }
        })
    }
}
