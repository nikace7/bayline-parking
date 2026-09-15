from django.urls import path

from modules.reports import views

urlpatterns = [
    path("reports/collections", views.CollectionsReportView.as_view()),
    path("reports/vehicle-log", views.VehicleLogReportView.as_view()),
]
