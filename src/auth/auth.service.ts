import { EventEmitter, Injectable } from '@angular/core';
import { FormioAuthConfig } from './auth.config';
import { FormioAppConfig } from '../index';

/* tslint:disable */
let Formio = require('formiojs');
let _each = require('lodash/each');
/* tslint:enable */

@Injectable()
export class FormioAuthService {
  public user: any;
  public authenticated: boolean = false;

  public loginForm: string;
  public onLogin: EventEmitter<object>;
  public onLogout: EventEmitter<object>;

  public registerForm: string;
  public onRegister: EventEmitter<object>;
  public onUser: EventEmitter<object>;
  public onError: EventEmitter<any>;

  public ready: Promise<boolean>;
  public readyResolve: any;
  public readyReject: any;

  public projectReady: Promise<any>;
  public accessReady: Promise<any>;
  public userReady: Promise<any>;
  public formAccess: any = {};
  public submissionAccess: any = {};
  public roles: any;
  public is: any = {};

  constructor(
    public appConfig: FormioAppConfig,
    public config: FormioAuthConfig
  ) {
    this.user = null;

    if (!this.config || !this.config.login || !this.config.register) {
      console.error('You must provide a FormioAuthConfig.');
      return;
    }

    if (this.appConfig && this.appConfig.appUrl) {
      Formio.setBaseUrl(this.appConfig.apiUrl);
      Formio.setProjectUrl(this.appConfig.appUrl);
      Formio.formOnly = !!this.appConfig.formOnly;
    } else {
      console.error('You must provide an AppConfig within your application!');
    }

    this.loginForm = this.appConfig.appUrl + '/' + this.config.login.form;
    this.registerForm = this.appConfig.appUrl + '/' + this.config.register.form;
    this.onLogin = new EventEmitter();
    this.onLogout = new EventEmitter();
    this.onRegister = new EventEmitter();
    this.onUser = new EventEmitter();
    this.onError = new EventEmitter();

    this.ready = new Promise((resolve: any, reject: any) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    // Register for the core events.
    Formio.events.on('formio.badToken', () => this.logoutError());
    Formio.events.on('formio.sessionExpired', () => this.logoutError());
    this.init();
  }

  onLoginSubmit(submission: object) {
    this.setUser(submission);
    this.onLogin.emit(submission);
  }

  onRegisterSubmit(submission: object) {
    this.setUser(submission);
    this.onRegister.emit(submission);
  }

  init() {
    this.projectReady = Formio.makeStaticRequest(this.appConfig.appUrl).then(
      (project: any) => {
        _each(project.access, (access: any) => {
          this.formAccess[access.type] = access.roles;
        });
      },
      (): any => {
        this.formAccess = {};
        return null;
      }
    );

    // Get the access for this project.
    this.accessReady = Formio.makeStaticRequest(
      this.appConfig.appUrl + '/access'
    ).then(
      (access: any) => {
        _each(access.forms, (form: any) => {
          this.submissionAccess[form.name] = {};
          form.submissionAccess.forEach((subAccess: any) => {
            this.submissionAccess[form.name][subAccess.type] = subAccess.roles;
          });
        });
        this.roles = access.roles;
        return access;
      },
      (): any => {
        this.roles = {};
        return null;
      }
    );

    this.userReady = Formio.currentUser().then((user: any) => {
      this.setUser(user);
      return user;
    });

    // Trigger we are redy when all promises have resolved.
    this.accessReady
      .then(() => this.projectReady)
      .then(() => this.userReady)
      .then(() => this.readyResolve(true))
      .catch((err: any) => this.readyReject(err));
  }

  setUser(user: any) {
    if (user) {
      this.user = user;
      localStorage.setItem('formioAppUser', JSON.stringify(user));
      this.setUserRoles();
    } else {
      this.user = null;
      this.is = {};
      localStorage.removeItem('formioAppUser');
      Formio.clearCache();
      Formio.setUser(null);
    }

    this.authenticated = !!Formio.getToken();
    this.onUser.emit(this.user);
  }

  setUserRoles() {
    this.accessReady.then(() => {
      _each(this.roles, (role: any, roleName: string) => {
        if (this.user.roles.indexOf(role._id) !== -1) {
          this.is[roleName] = true;
        }
      });
    });
  }

  logoutError() {
    this.setUser(null);
    localStorage.removeItem('formioToken');
    this.onError.emit();
  }

  logout() {
    this.setUser(null);
    localStorage.removeItem('formioToken');
    Formio.logout()
      .then(() => this.onLogout.emit())
      .catch(() => this.logoutError());
  }
}
