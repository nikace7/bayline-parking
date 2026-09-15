from django.urls import path

from modules.accounts import views

urlpatterns = [
    path("auth/register", views.RegisterView.as_view()),
    path("auth/customer/register", views.CustomerRegisterView.as_view()),
    path("auth/login", views.LoginView.as_view()),
    path("auth/logout", views.LogoutView.as_view()),
    path("auth/session", views.SessionView.as_view()),
    path("members", views.MemberListView.as_view()),
    path("members/<uuid:member_id>", views.MemberDetailView.as_view()),
]
