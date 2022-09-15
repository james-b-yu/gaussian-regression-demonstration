import { AfterViewChecked, AfterViewInit, Component, OnInit } from '@angular/core';
import { GR, LinalgService } from '../linalg.service';

import * as c3 from "c3";
import * as _ from "lodash";
import * as seedrandom from "seedrandom"
import * as plt from "plotly.js-dist-min"
import * as stat from "simple-statistics"
import { FormField } from '../components/form/form.component';
import { FormControl, Validators } from '@angular/forms';

declare const Module: any;

class MatrixObject {
    data: Float64Array;
    rows: number;
    cols: number;

    constructor(data: Float64Array, rows: number, cols: number) {
        this.data = data;
        this.rows = rows;
        this.cols = cols;
    }

    static rand(rows: number, cols: number, randFn = Math.random) {
        const newData = new Float64Array(rows * cols);
        for (let i = 0; i < rows * cols; ++i) {
            newData[i] = randFn();
        }

        return new MatrixObject(newData, rows, cols);
    }

    static add(a: MatrixObject, b: MatrixObject) {
        if (a.rows != b.rows || a.cols != b.cols) {
            throw "Rows and cols must be the same";
        }

        const newData = new Float64Array(a.rows * a.cols);
        for (let i = 0; i < a.rows * a.cols; ++i) {
            newData[i] = a.data[i] + b.data[i];
        }

        return new MatrixObject(newData, a.rows, a.cols);
    }

    static range(start: number, end: number, step: number) {
        const length = Math.floor((end - start) / step) + 1;
        const newData = new Float64Array(length);
        newData[0] = start;
        for (let i = 1; i < length; ++i) {
            newData[i] = newData[i - 1] + step;
        }

        return new MatrixObject(newData, length, 1);
    }

    apply(fn: (x: number) => number): MatrixObject {
        const newData = new Float64Array(this.data.length);

        for (let i = 0; i < this.data.length; ++i) {
            newData[i] = fn(this.data[i]);
        }

        return new MatrixObject(newData, this.rows, this.cols);
    }
}

class Example {
    X: MatrixObject;
    y: MatrixObject;

    Xt: MatrixObject;
    yt: MatrixObject;

    rng: seedrandom.PRNG;
    yNoiseStd: number;

    constructor(xRange: [number, number], xtRange: [number, number], fn: (x: number) => number, randomX = false, yNoiseStd = 0.0, numPredictions = 10, numXSamples = 10) {
        this.rng = seedrandom(new Date().getTime().toString());

        this.Xt = MatrixObject.range(xtRange[0], xtRange[1], (xtRange[1] - xtRange[0]) / (numPredictions - 1));
        this.X = MatrixObject.range(xRange[0], xRange[1], (xRange[1] - xRange[0]) / (numXSamples - 1));
        this.yt = this.Xt.apply(fn);

        this.yNoiseStd = yNoiseStd;

        if (randomX) {
            this.X = MatrixObject.rand(this.X.rows, this.X.cols, () => {
                const max = xRange[0];
                const min = xRange[1];
                return this.rng() * (max - min) + min;
            });
        }

        const noise = MatrixObject.rand(this.X.rows, 1, () => yNoiseStd * stat.probit(this.rng()));

        this.y = MatrixObject.add(noise, this.X.apply(fn));
    }

    predict(v = 1, l = 1, s: number | null = 0, m: number | null = null): [MatrixObject, MatrixObject, MatrixObject] {
        if (m === null) {
            m = -1;
        }

        if (s === null) {
            s = this.yNoiseStd;
        }

        const grTest = (window as any).Module.gr(this.X, this.y, this.Xt, v, l, s, m);
        return [grTest.mean, grTest.covariance, grTest.variance];
    }
}

interface ExampleParams {
    name: string
    xRange: [number, number],
    xtRange: [number, number],
    fn: (x: number) => number
}

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit, AfterViewInit {
    exampleParams: ExampleParams[] = [
        {
            name: "sin(x)",
            xRange: [-Math.PI, Math.PI],
            xtRange: [-4 * Math.PI, 4 * Math.PI],
            fn: v => Math.sin(v),
        }, {
            name: "exp(x)",
            xRange: [0, 10],
            xtRange: [-2, 12],
            fn: x => Math.exp(x * Math.cos(x)) * Math.sin(x),
        }
    ];


    protected sampleConfig: FormField[] = [
        {
            name: "function",
            label: "Choose Function",
            controlOptions: [0, [Validators.required]],
            invalidFeedback: "Required",
            type: "select",
            selectOptions: this.exampleParams.map(v => v.name)
        },
        {
            name: "numSamples",
            label: "Number of samples",
            controlOptions: [5, [Validators.required]],
            invalidFeedback: "Required",
            type: "number",
            numberMin: 1,
            numberStep: 1,
            numberMax: 50
        },
        {
            name: "sampleMethod",
            label: "Sample Method",
            controlOptions: [0, [Validators.required]],
            invalidFeedback: "Required",
            type: "select",
            selectOptions: ["Evenly spaced", "Random"]
        },
        {
            name: "yNoise",
            label: "Sample noise",
            controlOptions: [0.2, [Validators.required]],
            invalidFeedback: "Required",
            type: "number",
            defaultCheckbox: {
                label: "No noise",
                checked: false,
                engageOverwriteValue: 0.0
            },
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5
        }
    ]

    protected paramConfig: FormField[] = [
        {
            name: "m",
            label: "Prior mean",
            controlOptions: ["", []],
            invalidFeedback: "Required",
            type: "number",
            defaultCheckbox: {
                label: "Use average from samples",
                checked: true,
                engageOverwriteValue: "",
                disengageOverwriteValue: 0.0
            },
            numberStep: 0.5
        },
        {
            name: "s",
            label: "Prior dataset noise",
            controlOptions: [0, []],
            invalidFeedback: "Required",
            type: "number",
            defaultCheckbox: {
                label: "Match with sample noise",
                checked: true,
                engageOverwriteValue: ""
            },
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5
        },
        {
            name: "l",
            label: "Length scale factor",
            controlOptions: [1.0, Validators.required],
            invalidFeedback: "Required",
            type: "number",
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5
        },
        {
            name: "v",
            label: "Vertical scale factor",
            controlOptions: [1.0, Validators.required],
            invalidFeedback: "Required",
            type: "number",
            numberMin: 0,
            numberStep: 0.1,
            numberMax: 5
        }
    ];

    protected formLayout: number[] = [1, 3, 4];

    protected currentExample: Example | null = null;
    protected currentHPs: [number, number, number | null, number | null] = [1, 1, 0, null];
    protected currentExampleParams: ExampleParams | null = null;

    constructor(private linalg: LinalgService) {
    }

    ngAfterViewInit(): void {
        const randomX = false;
        const yNoiseStd = 0.2;

        this.currentExampleParams = this.exampleParams[0];

        this.currentExample = new Example(
            this.currentExampleParams.xRange,
            this.currentExampleParams.xtRange,
            this.currentExampleParams.fn,
            randomX,
            yNoiseStd,
            100
        )

        const prediction = this.currentExample.predict(...this.currentHPs);
        this.drawExample(this.currentExample, prediction);
    }

    drawExample(theExample: Example, prediction: [MatrixObject, MatrixObject, MatrixObject]) {
        const samples: plt.Data = {
            x: theExample.X.data,
            y: theExample.y.data,
            mode: "markers",
            marker: {
                color: "#000",
                symbol: "x"
            },
            name: "Samples"
        };

        const trueFn: plt.Data = {
            x: theExample.Xt.data,
            y: theExample.yt.data,
            mode: "lines",
            line: {
                color: "#0005",
                shape: "spline",
                smoothing: 0.2
            },
            name: "True function"
        };


        const predictedMean: plt.Data = {
            x: theExample.Xt.data,
            y: prediction[0].data,
            mode: "lines",
            line: {
                color: "#00FA",
                smoothing: 0.2,
                shape: "spline"
            },
            name: "Maximum a posteriori estimate"
        };

        const confidenceIntervalTop: plt.Data = {
            x: theExample.Xt.data,
            y: prediction[2].data.map((v, i) => prediction[0].data[i] + 1.96 * v ** 0.5),
            mode: "lines",
            line: {
                color: "#00F3",
                smoothing: 0.2,
                shape: "spline"
            },
            legendgroup: "fill",
            showlegend: false
        };

        const confidenceIntervalBottom: plt.Data = {
            x: theExample.Xt.data,
            y: prediction[2].data.map((v, i) => prediction[0].data[i] - 1.96 * v ** 0.5),
            mode: "lines",
            line: {
                color: "#00F3",
                smoothing: 0.2,
                shape: "spline"
            },
            fill: "tonexty",
            fillcolor: "#00F1",
            legendgroup: "fill",
            name: "95% confidence interval"
        };

        const layout: Partial<plt.Layout> = {
            title: "Mine"
        };

        const config: Partial<plt.Config> = {
            displaylogo: false,

        }

        const a = plt.newPlot("chart", [samples, trueFn, predictedMean, confidenceIntervalTop, confidenceIntervalBottom], layout, config);
    }

    ngOnInit(): void {
    }

    protected onSampleConfigChange(ctrl: FormControl) {
        if (ctrl.invalid) {
            return;
        }

        const theFunc = ctrl.get("function")!.value;

        this.currentExampleParams = this.exampleParams[theFunc];

        this.currentExample = new Example(
            this.currentExampleParams.xRange,
            this.currentExampleParams.xtRange,
            this.currentExampleParams.fn,
            ctrl.get("sampleMethod")!.value == 1,
            +ctrl.get("yNoise")!.value,
            250,
            +Math.floor(ctrl.get("numSamples")!.value)
        )

        const prediction = this.currentExample.predict(...this.currentHPs);
        this.drawExample(this.currentExample, prediction);

    }

    protected onHPConfigChange(ctrl: FormControl, redraw = true) {
        this.currentHPs = [+ctrl.get("v")!.value, +ctrl.get("l")!.value, ctrl.get("s")!.value === "" ? null : +ctrl.get("s")!.value, ctrl.get("m")!.value === "" ? null : +ctrl.get("m")!.value]

        if (redraw) {
            const prediction = this.currentExample!.predict(...this.currentHPs);
            this.drawExample(this.currentExample as Example, prediction);
        }
    }
}
