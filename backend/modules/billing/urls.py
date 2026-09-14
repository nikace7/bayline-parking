from django.urls import path

from modules.billing import views

urlpatterns = [
    path("parking/sessions", views.SessionListView.as_view()),
    path("parking/sessions/<uuid:session_id>", views.SessionDetailView.as_view()),
    path("parking/sessions/<uuid:session_id>/quote", views.QuoteView.as_view()),
    path("parking/sessions/<uuid:session_id>/checkout", views.CheckoutView.as_view()),
    path("parking/sessions/<uuid:session_id>/exit", views.ExitView.as_view()),
    path("invoices/<uuid:invoice_id>/payments", views.CashPaymentView.as_view()),
    path("shifts/open", views.ShiftOpenView.as_view()),
    path("shifts/current", views.CurrentShiftView.as_view()),
]
