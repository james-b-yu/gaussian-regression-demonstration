import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { distinctUntilChanged, map, merge, Observable, OperatorFunction, Subject } from 'rxjs';
import { NgbDatepickerNavigateEvent, NgbInputDatepicker } from '@ng-bootstrap/ng-bootstrap';
import { definedOr } from 'src/app/utils/defined-or';

export interface CrossValidationFn {
    (control: AbstractControl): { crossValidation: boolean } | null;
}

export interface SuggestionsConfig {
    syncSuggestions?: string[];
    forceSyncSuggestions?: boolean;
    suggestOnFocus?: boolean;
}

export interface OptionalConfig {
    optionalShown?: boolean;
    optionalDefault?: any; // use this value as the default value when the user removes or adds the optoinal field. otherwise we use the value given by controlOptions. however, when loading for the first time, the value from the controlOptions has priority over optionalDefault
}

export interface DefaultCheckboxConfig {
    engageOverwriteValue?: any; // value to overwrite the control value with when defaulted. if null or undefined, will use the value given in controlOptions[0] array
    disengageOverwriteValue?: any; // value to overwrite the control value with when defaulted. if null or undefined, will use the value given in controlOptions[0] array
    label: string;
    checked?: boolean;
}

/**
 * Validators can set the `custom` key of ctrl.errors to have that custom message displayed
 * otherwise, the default invalidFeedback message will be shown
 */
export interface FormField {
    name: string;
    controlOptions: any;
    label: string;
    invalidFeedback: string;
    type: "button" | "checkbox" | "color" | "date" | "datetime-local" | "email" | "file" | "hidden" | "image" | "month" | "number" | "password" | "radio" | "range" | "reset" | "search" | "submit" | "tel" | "text" | "time" | "url" | "week" | "textarea" | "select";
    suggestions?: SuggestionsConfig,
    selectOptions?: string[];
    optional?: OptionalConfig;
    defaultCheckbox?: DefaultCheckboxConfig;

    numberMin?: number;
    numberMax?: number;
    numberStep?: number;
}

@Component({
    selector: 'app-form',
    templateUrl: './form.component.html',
    styleUrls: ['./form.component.scss']
})
export class FormComponent implements OnInit {

    /**
     * Array of form fields defining the form
     */
    @Input() public formInput: FormField[] = [];
    /**
     * array of integers defining the shape of the form
     * eg: if we have three FormFields, then if gridArrangement == [2, 1], the first two FormFields will be placed in a row next to each other, with the third one in the next row
     * the FormComponent will automatically add extra 1s if there are not enough numbers, so [2] will suffice
     * eg: if we supply a blank gridArrangement, it will fill it with n 1s, where n = formInput.length
     */
    @Input() public gridArrangement: number[] = [];
    /**
     * cross validator to be run after all specific validators are run
     * get each control value by running ctrl.get("ctrlName")
     */
    @Input() public crossValidator: CrossValidationFn = (_ctrl) => { return null };
    /**
     * text to be displayed on the submit button
     */
    @Input() public submitButtonText: string | null = "";
    /**
     * set this to display a message next to the submit text
     */
    @Input() public formResponseError = "";
    /**
     * event to be emitted when the submit button is pressed
     */
    @Output() public onSubmit = new EventEmitter();

    @Output() public onChange = new EventEmitter();

    protected formInputArrangement: FormField[][] = [];

    protected theForm: FormGroup;

    constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef) {
        this.theForm = fb.group({});
    }

    protected syncSuggestionsClickEvents: Record<string, Subject<string>> = {};
    protected syncSuggestionsFocusEvents: Record<string, Subject<string>> = {};
    protected syncSuggestionsSearch: Record<string, OperatorFunction<string, readonly string[]>> = {};
    protected defaultCheckboxRestoreValues: Record<string, any> = {};

    public ngOnInit(): void {
        let controls: any = {};

        // pad grid arrangement with 1s if necessary
        const gridArrangementSum = this.gridArrangement.reduce((a, b) => a + b, 0);
        if (gridArrangementSum < this.formInput.length) {
            this.gridArrangement = [...this.gridArrangement, ...Array(this.formInput.length - gridArrangementSum).fill(1)];
        }
        // populate with references
        let currentFieldIndex = 0;
        for (let i = 0; i < this.gridArrangement.length && currentFieldIndex < this.formInput.length; ++i) {
            let arrangedFields: FormField[] = [];
            for (let j = 0; j < this.gridArrangement[i]; ++j) {
                arrangedFields.push(this.formInput[currentFieldIndex++]);
            }
            this.formInputArrangement.push(arrangedFields);
        }

        for (let i of this.formInput) {
            // wrap second argument in an array
            if (!Array.isArray(i.controlOptions[1])) {
                i.controlOptions[1] = [i.controlOptions[1]];
            }

            if (i.optional) {
                i.optional.optionalShown = !!i.optional.optionalShown; // force it into a boolean
                i.controlOptions[0] = definedOr(i.controlOptions[0], i.optional.optionalDefault);
            }

            // add special validators and values for month
            // the internal representation of the month-year should be an array [month, year]
            // month is a value going from 1 to 12, year is the year in numbers
            // a value of 0 for either indicates null
            if (i.type == "month") {
                // todo: populate based on input date

                if (!Array.isArray(i.controlOptions[0]) || i.controlOptions[0].length != 2) {
                    i.controlOptions[0] = [0, 0];
                }

                // since internal representation is always "present", we must add a custom validator checking whether both month and year are filled
                if (i.controlOptions[1].indexOf(Validators.required) != -1) {
                    i.controlOptions[1].push((ctrl: AbstractControl): ValidationErrors | null => {
                        return Array.isArray(ctrl.value) && ctrl.value[0] >= 1 && ctrl.value[0] <= 12 && ctrl.value[1] > 0 ? null : { monthYear: true }
                    });
                }
            }

            // dealing with suggestions
            if (i.suggestions && i.suggestions.syncSuggestions) {
                // save click and focus events
                this.syncSuggestionsClickEvents[i.name] = new Subject<string>();
                this.syncSuggestionsFocusEvents[i.name] = new Subject<string>();

                // function passed to ng-bootstrap which triggers the autocomplete
                this.syncSuggestionsSearch[i.name] = (text$: Observable<string>) => {
                    let distinctText$ = text$.pipe(distinctUntilChanged());
                    return merge(distinctText$, this.syncSuggestionsClickEvents[i.name], this.syncSuggestionsFocusEvents[i.name]).pipe(
                        map(term => {
                            return (i.suggestions?.syncSuggestions as string[]).filter(v => v.toLocaleLowerCase().startsWith(term.toLocaleLowerCase()))
                        })
                    );
                };

                if (i.suggestions.forceSyncSuggestions) {
                    // add validator which forces one of the suggestions
                    let theRegexStr = `^(${i.suggestions.syncSuggestions.join("|")})$`
                    i.controlOptions[1].push(Validators.pattern(theRegexStr));
                }
            }

            // dealing with default checkbox
            if (i.defaultCheckbox) {
                this.defaultCheckboxRestoreValues[i.name] = i.controlOptions[0];
            }

            // dealing with number
            if (i.type == "number") {
                if (i.numberMin !== undefined) {
                    i.controlOptions[1].push(Validators.min(i.numberMin));
                }

                if (i.numberMax !== undefined) {
                    i.controlOptions[1].push(Validators.max(i.numberMax));
                }
            }


            controls[i.name] = i.controlOptions;
        }

        this.theForm = this.fb.group(controls, {
            validators: this.crossValidator,
            updateOn: "change"
        });

        // engage default checkbox if checked
        for (let i of this.formInput) {
            if (i.defaultCheckbox?.checked) {
                this.engageDefault(i);
            }
        }

        this.theForm.valueChanges.subscribe(_x => this.onChange.emit(this.theForm));
    }

    protected onSubmitInternal(): void {
        // trim all text types
        for (let item of this.formInput) {
            if (["text", "textarea"].indexOf(item.type) != -1 && this.theForm.controls[item.name].value && this.theForm.controls[item.name].value.trim) {
                this.theForm.controls[item.name].setValue(this.theForm.controls[item.name].value.trim());
            }
        }

        if (this.theForm.invalid) {
            this.theForm.markAllAsTouched();
            return;
        }

        this.onSubmit.emit(this.theForm);
    }

    /**
     * clear the optional's value, hide it from view, and add it back to the list of optionals that can be added
     */
    protected hideOptional(item: FormField) {
        this.theForm.controls[item.name].setValue(definedOr(item.optional!.optionalDefault, item.controlOptions[0])); // reset the form control value to its default
        item.optional!.optionalShown = false;
        this.cdr.detectChanges();
    }

    protected addOptional(item: FormField) {
        this.theForm.controls[item.name].setValue(definedOr(item.optional!.optionalDefault, item.controlOptions[0])); // reset the form control value to its default
        item.optional!.optionalShown = true;
        this.cdr.detectChanges();
    }

    protected get hasOptionalsToAdd(): boolean {
        return this.formInput.filter(v => v.optional && !v.optional.optionalShown).length > 0;
    }

    /**
     * get array of years from -10 years to +10 years from today
     */
    protected get yearArray(): number[] {
        const startYear: number = new Date().getFullYear() - 10;
        const res = [...Array(20).fill(0).map((v, i) => startYear + i)];
        return res;
    }

    protected setMonthYear(item: FormField, month: string, year: string) {
        this.theForm.controls[item.name].setValue([Number(month), Number(year)]);
        this.theForm.controls[item.name].markAsDirty();
    }


    protected setDefaultCheckboxEngaged(item: FormField, evt: Event) {
        if ((evt.target as HTMLInputElement).checked) {
            this.engageDefault(item);
        } else {
            this.disengageDefault(item);
        }
    }

    protected engageDefault(item: FormField) {
        if (this.theForm.controls[item.name].disabled) {
            return; // don't engage twice
        }

        this.defaultCheckboxRestoreValues[item.name] = this.theForm.controls[item.name].value;

        this.theForm.controls[item.name].disable();

        this.theForm.controls[item.name].setValue(definedOr(item.defaultCheckbox?.engageOverwriteValue, item.controlOptions[0]));
    }

    protected disengageDefault(item: FormField) {
        if (this.theForm.controls[item.name].enabled) {
            return; // dont disengage twice
        }

        this.theForm.controls[item.name].setValue(definedOr(item.defaultCheckbox?.disengageOverwriteValue, this.defaultCheckboxRestoreValues[item.name]));

        this.theForm.controls[item.name].enable();
    }

    protected testDefaultCheckboxEngaged(item: FormField, el: HTMLInputElement) {
    }

    protected fieldIsRequired(item: FormField) {
        return item.controlOptions[1] == Validators.required || item.controlOptions[1].indexOf(Validators.required) != -1;
    }

    protected toHTMLInputElement(e: any) {
        return e as HTMLInputElement;
    }
}
