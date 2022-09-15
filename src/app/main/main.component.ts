import { AfterViewChecked, AfterViewInit, Component, OnInit } from '@angular/core';
import { GR, LinalgService } from '../linalg.service';
import { Matrix } from "ml-matrix";
import * as c3 from "c3";
import * as _ from "lodash";
import * as seedrandom from "seedrandom"
import * as plt from "plotly.js-dist-min"
import * as stat from "simple-statistics"
import { FormField } from '../components/form/form.component';
import { FormControl, Validators } from '@angular/forms';

class Example {
    X: Matrix;
    y: Matrix;

    Xt: Matrix;
    yt: Matrix;

    rng: seedrandom.PRNG;
    yNoiseStd: number;

    constructor(xRange: [number, number], xtRange: [number, number], fn: (X: Matrix) => Matrix, randomX = false, yNoiseStd = 0.0, numPredictions = 10, numXSamples = 10) {
        this.rng = seedrandom(new Date().getTime().toString());

        this.Xt = new Matrix([_.range(xtRange[0], xtRange[1], (xtRange[1] - xtRange[0]) / numPredictions)]).transpose();
        this.yt = fn(this.Xt);

        this.X = new Matrix([_.range(xRange[0], xRange[1], (xRange[1] - xRange[0]) / numXSamples)]).transpose();

        this.yNoiseStd = yNoiseStd;

        if (randomX) {
            this.X = Matrix.rand(this.X.rows, this.X.columns, {
                random: () => {
                    const max = this.X.max();
                    const min = this.X.min();
                    return this.rng() * (max - min) + min;
                }
            });
        }

        const noise = Matrix.random(this.X.rows, 1, {
            random: () => {
                return yNoiseStd * stat.probit(this.rng());
            }
        })

        this.y = Matrix.add(noise, fn(this.X));
    }

    predict(v = 1, l = 1, s: number | null = 0, m: number | null = null) {
        const gr = new GR(this.X, this.y, v, l, s === null ? this.yNoiseStd : s, m);

        return gr.predict(this.Xt);
    }
}

interface ExampleParams {
    name: string
    xRange: [number, number],
    xtRange: [number, number],
    fn: (X: Matrix) => Matrix
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
            fn: X => Matrix.sin(X),
        }, {
            name: "exp(x)",
            xRange: [0, 10],
            xtRange: [-2, 12],
            fn: X => Matrix.exp(Matrix.cos(X)).mul(Matrix.sin(X)),
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

    drawExample(theExample: Example, prediction: [Matrix, Matrix]) {
        const samples: plt.Data = {
            x: theExample.X.getColumn(0),
            y: theExample.y.getColumn(0),
            mode: "markers",
            marker: {
                color: "#000",
                symbol: "x"
            },
            name: "Samples"
        };

        const trueFn: plt.Data = {
            x: theExample.Xt.getColumn(0),
            y: theExample.yt.getColumn(0),
            mode: "lines",
            line: {
                color: "#0005",
                shape: "spline",
                smoothing: 0.2
            },
            name: "True function"
        };


        const predictedMean: plt.Data = {
            x: theExample.Xt.getColumn(0),
            y: prediction[0].getColumn(0),
            mode: "lines",
            line: {
                color: "#00FA",
                smoothing: 0.2,
                shape: "spline"
            },
            name: "Maximum a posteriori estimate"
        };

        const confidenceIntervalTop: plt.Data = {
            x: theExample.Xt.getColumn(0),
            y: prediction[1].diag().map((v, i) => prediction[0].getColumn(0)[i] + 1.96 * v ** 0.5),
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
            x: theExample.Xt.getColumn(0),
            y: prediction[1].diag().map((v, i) => prediction[0].getColumn(0)[i] - 1.96 * v ** 0.5),
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
        this.currentHPs = [ctrl.get("v")!.value, ctrl.get("l")!.value, ctrl.get("s")!.value === "" ? null : +ctrl.get("s")!.value, ctrl.get("m")!.value === "" ? null : +ctrl.get("m")!.value]

        if (redraw) {
            const prediction = this.currentExample!.predict(...this.currentHPs);
            this.drawExample(this.currentExample as Example, prediction);
        }
    }
}
