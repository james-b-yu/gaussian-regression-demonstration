import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormComponent } from './components/form/form.component';
import { MainComponent } from './main/main.component';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgLetModule } from 'ng-let';

@NgModule({
    declarations: [
        AppComponent,
        FormComponent,
        MainComponent,
    ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        NgbModule,
        ReactiveFormsModule,
        NgLetModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
