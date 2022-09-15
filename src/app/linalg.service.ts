import { Injectable } from '@angular/core';
import { Matrix, inverse } from "ml-matrix"

export class GR {
    private X: Matrix;
    private y: Matrix;
    private m: number;
    private s: number;
    private v: number;
    private l: number;
    private K1: Matrix;
    private S1: Matrix;
    private K1S1Inv: Matrix;
    private yDemeaned: Matrix;
    private K1S1InvTimesYDemeaned: Matrix;



    constructor(X: Matrix, y: Matrix, v = 1.0, l = 1.0, s = 0.0, m: null | number = null) {
        this.X = X;
        this.y = y;

        if (m === null) {
            m  = y.mean();
        }

        this.m = m;
        this.s = s;
        this.v = v;
        this.l = l;

        this.K1 = this.kernel(X, X);
        this.S1 = Matrix.identity(X.rows).mul(s ** 2 + 1e-6);

        this.K1S1Inv = inverse(Matrix.add(this.K1, this.S1));
        this.yDemeaned = Matrix.sub(this.y, m);
        this.K1S1InvTimesYDemeaned = this.K1S1Inv.mmul(this.yDemeaned);
    }

    private squared_norm(A: Matrix, B: Matrix) {
        const res = new Matrix(A.rows, B.rows);
        for (let i = 0; i < A.rows; ++i) {
            for (let j = 0; j < B.rows; ++j) {
                const a = A.getRowVector(i);
                const b = B.getRowVector(j);
                const diff = Matrix.subtract(a, b).norm("frobenius") ** 2;
                res.set(i, j, diff);
            }
        }

        return res;
    }

    private kernel(A: Matrix, B: Matrix) {
        return this.squared_norm(A, B).mul(-0.5 / this.l ** 2).exp().mul(this.v ** 2);
    }

    public predict(Xt: Matrix): [Matrix, Matrix] {
        const K2 = this.kernel(this.X, Xt);
        const K3 = K2.transpose();
        const K4 = this.kernel(Xt, Xt);

        const posteriorMean = Matrix.add(K3.mmul(this.K1S1InvTimesYDemeaned), this.m);
        const posteriorCovariance = Matrix.sub(K4, K3.mmul(this.K1S1Inv).mmul(K2));

        return [posteriorMean, posteriorCovariance];
    }
}

@Injectable({
  providedIn: 'root'
})
export class LinalgService {

  constructor() {
    console.log("hello");
    console.log(Matrix);
    (window as any).Matrix = Matrix;
  } 
}
